// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

interface IERC6551Account {
    function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId);
    function state() external view returns (uint256);
    function isValidSigner(address signer, bytes calldata context) external view returns (bytes4 magicValue);
}

interface IERC6551Executable {
    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        returns (bytes memory result);
}

interface ILooperAgentPolicy {
    function preAuthorizeAndConsume(
        address sessionKey,
        address owner,
        uint256 policyEpoch,
        address to,
        uint256 value,
        bytes calldata data
    ) external returns (bytes4);

    function postValidate(
        address sessionKey,
        address owner,
        uint256 policyEpoch,
        address to,
        uint256 value,
        bytes calldata data,
        bytes calldata result
    ) external view returns (bytes4);
}

interface ILooperAgentModuleRegistry {
    function globallyPaused() external view returns (bool);
    function approvedModuleCodehash(address module) external view returns (bytes32);
}

contract LooperAgentAccount is IERC165, IERC1271, IERC6551Account, IERC6551Executable {
    struct PolicyContext {
        address sessionKey;
        address owner;
        uint256 epoch;
        address to;
        uint256 value;
    }

    bytes4 private constant _ERC1271_MAGIC = IERC1271.isValidSignature.selector;
    bytes4 private constant _INVALID_MAGIC = 0xffffffff;
    bytes4 private constant _COMBINED_INTERFACE_ID = 0xb39e6aed;
    bytes10 private constant _PROXY_PREFIX = 0x363d3d373d3d3d363d73;
    bytes15 private constant _PROXY_SUFFIX = 0x5af43d82803e903d91602b57fd5bf3;
    uint256 private constant _PROXY_RUNTIME_LENGTH = 173;
    uint256 private constant _TOKEN_FOOTER_OFFSET = 77;

    address private immutable _implementation = address(this);
    address public immutable moduleRegistry;

    uint256 public state;
    address public policyModule;
    address public policyModuleOwner;
    uint256 public policyEpoch;
    uint256 private _executionGuard;

    error InvalidOperation(uint8 operation);
    error InvalidSigner(address caller, address owner);
    error InvalidModuleRegistry(address registry);
    error InvalidPolicyModule(address module);
    error PolicyRegistryPaused();
    error PolicyModuleNotApproved(address module);
    error PolicyModuleCodehashMismatch(address module, bytes32 approved, bytes32 actual);
    error PolicyInterfaceUnsupported(address module);
    error PolicyOwnerChanged(address selectedOwner, address currentOwner);
    error PolicyHookFailed(bytes4 selector);
    error InvalidPolicyMagic(bytes4 selector);
    error ReentrantExecution();

    event StateUpdated(uint256 indexed state);
    event PolicyModuleUpdated(address indexed module, address indexed owner, uint256 indexed policyEpoch);

    constructor(address moduleRegistry_) {
        if (moduleRegistry_ == address(0) || moduleRegistry_.code.length == 0) {
            revert InvalidModuleRegistry(moduleRegistry_);
        }
        moduleRegistry = moduleRegistry_;
    }

    modifier nonReentrantExecution() {
        if (_executionGuard != 0) revert ReentrantExecution();
        _executionGuard = 1;
        _;
        _executionGuard = 0;
    }

    receive() external payable {
        if (!_hasCanonicalContext()) revert InvalidSigner(msg.sender, address(0));
    }

    function token() public view returns (uint256 chainId, address tokenContract, uint256 tokenId) {
        bool valid;
        (valid, chainId, tokenContract, tokenId) = _tokenContext();
        if (!valid) return (0, address(0), 0);
    }

    function owner() public view returns (address currentOwner) {
        (bool valid, uint256 tokenChainId, address tokenContract, uint256 tokenId) = _tokenContext();
        if (!valid || tokenChainId != block.chainid || tokenContract.code.length == 0) return address(0);

        (bool success, bytes memory result) = tokenContract.staticcall(
            abi.encodeWithSelector(IERC721.ownerOf.selector, tokenId)
        );
        if (!success || result.length != 32) return address(0);

        uint256 ownerWord;
        assembly {
            ownerWord := mload(add(result, 0x20))
        }
        if (ownerWord == 0 || ownerWord >> 160 != 0) return address(0);
        return address(uint160(ownerWord));
    }

    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        nonReentrantExecution
        returns (bytes memory result)
    {
        address currentOwner = owner();
        if (currentOwner == address(0) || msg.sender != currentOwner) {
            revert InvalidSigner(msg.sender, currentOwner);
        }
        if (operation != 0) revert InvalidOperation(operation);

        state += 1;
        emit StateUpdated(state);

        bool success;
        (success, result) = to.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 0x20), mload(result))
            }
        }
    }

    function setPolicyModule(address module) external {
        address currentOwner = owner();
        if (currentOwner == address(0) || msg.sender != currentOwner) {
            revert InvalidSigner(msg.sender, currentOwner);
        }

        address selectedOwner;
        if (module != address(0)) {
            _requireApprovedPolicy(module);
            selectedOwner = currentOwner;
        }

        policyModule = module;
        policyModuleOwner = selectedOwner;
        policyEpoch += 1;
        emit PolicyModuleUpdated(module, selectedOwner, policyEpoch);
    }

    function executeWithPolicy(address to, uint256 value, bytes calldata data)
        external
        payable
        nonReentrantExecution
        returns (bytes memory result)
    {
        address currentOwner = owner();
        address module = policyModule;

        if (module == address(0)) revert InvalidPolicyModule(module);
        if (currentOwner == address(0) || currentOwner != policyModuleOwner) {
            revert PolicyOwnerChanged(policyModuleOwner, currentOwner);
        }
        _requireApprovedPolicy(module);

        PolicyContext memory context = PolicyContext(msg.sender, currentOwner, policyEpoch, to, value);
        _callPre(module, context, data);

        state += 1;
        emit StateUpdated(state);

        bool success;
        (success, result) = to.call{value: value}(data);
        if (!success) _bubble(result);

        _callPost(module, context, data, result);
    }

    function _callPre(address module, PolicyContext memory context, bytes calldata data) private {
        (bool success, bytes memory result) = module.call{gas: 120_000}(
            abi.encodeWithSelector(
                ILooperAgentPolicy.preAuthorizeAndConsume.selector,
                context.sessionKey,
                context.owner,
                context.epoch,
                context.to,
                context.value,
                data
            )
        );
        _requireHookResult(success, result, ILooperAgentPolicy.preAuthorizeAndConsume.selector);
    }

    function _callPost(address module, PolicyContext memory context, bytes calldata data, bytes memory targetResult)
        private
        view
    {
        (bool success, bytes memory result) = module.staticcall{gas: 60_000}(
            abi.encodeWithSelector(
                ILooperAgentPolicy.postValidate.selector,
                context.sessionKey,
                context.owner,
                context.epoch,
                context.to,
                context.value,
                data,
                targetResult
            )
        );
        _requireHookResult(success, result, ILooperAgentPolicy.postValidate.selector);
    }

    function isValidSigner(address signer, bytes calldata) external view returns (bytes4 magicValue) {
        address currentOwner = owner();
        return currentOwner != address(0) && signer == currentOwner
            ? this.isValidSigner.selector
            : _INVALID_MAGIC;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4 magicValue) {
        address currentOwner = owner();
        return currentOwner != address(0) && SignatureChecker.isValidSignatureNow(currentOwner, hash, signature)
            ? _ERC1271_MAGIC
            : _INVALID_MAGIC;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(IERC1271).interfaceId
            || interfaceId == type(IERC6551Account).interfaceId
            || interfaceId == type(IERC6551Executable).interfaceId
            || interfaceId == _COMBINED_INTERFACE_ID;
    }

    function _requireApprovedPolicy(address module) private view {
        if (module.code.length == 0) revert InvalidPolicyModule(module);

        (bool success, bytes memory result) = moduleRegistry.staticcall(
            abi.encodeWithSelector(ILooperAgentModuleRegistry.globallyPaused.selector)
        );
        if (!success || result.length != 32) revert PolicyRegistryPaused();
        uint256 pausedWord;
        assembly {
            pausedWord := mload(add(result, 0x20))
        }
        if (pausedWord != 0) revert PolicyRegistryPaused();

        (success, result) = moduleRegistry.staticcall(
            abi.encodeWithSelector(ILooperAgentModuleRegistry.approvedModuleCodehash.selector, module)
        );
        if (!success || result.length != 32) revert PolicyModuleNotApproved(module);
        bytes32 approved;
        assembly {
            approved := mload(add(result, 0x20))
        }
        if (approved == bytes32(0)) revert PolicyModuleNotApproved(module);

        bytes32 actual = module.codehash;
        if (actual != approved) revert PolicyModuleCodehashMismatch(module, approved, actual);

        (success, result) = module.staticcall{gas: 30_000}(
            abi.encodeWithSelector(IERC165.supportsInterface.selector, type(ILooperAgentPolicy).interfaceId)
        );
        if (!success || result.length != 32) revert PolicyInterfaceUnsupported(module);
        uint256 supportedWord;
        assembly {
            supportedWord := mload(add(result, 0x20))
        }
        if (supportedWord != 1) revert PolicyInterfaceUnsupported(module);
    }

    function _requireHookResult(bool success, bytes memory result, bytes4 expected) private pure {
        if (!success) {
            if (result.length != 0) _bubble(result);
            revert PolicyHookFailed(expected);
        }
        if (result.length != 32) revert InvalidPolicyMagic(expected);
        bytes32 returnedWord;
        assembly {
            returnedWord := mload(add(result, 0x20))
        }
        if (returnedWord != bytes32(expected)) revert InvalidPolicyMagic(expected);
    }

    function _bubble(bytes memory result) private pure {
        assembly {
            revert(add(result, 0x20), mload(result))
        }
    }

    function _hasCanonicalContext() private view returns (bool valid) {
        (valid,,,) = _tokenContext();
    }

    function _tokenContext()
        private
        view
        returns (bool valid, uint256 chainId, address tokenContract, uint256 tokenId)
    {
        uint256 codeLength;
        assembly {
            codeLength := extcodesize(address())
        }
        if (codeLength != _PROXY_RUNTIME_LENGTH) return (false, 0, address(0), 0);

        bytes memory header = new bytes(45);
        assembly {
            extcodecopy(address(), add(header, 0x20), 0, 45)
        }
        if (keccak256(header) != keccak256(abi.encodePacked(_PROXY_PREFIX, _implementation, _PROXY_SUFFIX))) {
            return (false, 0, address(0), 0);
        }

        uint256 tokenContractWord;
        assembly {
            let pointer := mload(0x40)
            extcodecopy(address(), pointer, _TOKEN_FOOTER_OFFSET, 0x60)
            chainId := mload(pointer)
            tokenContractWord := mload(add(pointer, 0x20))
            tokenId := mload(add(pointer, 0x40))
        }
        if (chainId == 0 || tokenContractWord == 0 || tokenContractWord >> 160 != 0) {
            return (false, 0, address(0), 0);
        }
        tokenContract = address(uint160(tokenContractWord));
        return (true, chainId, tokenContract, tokenId);
    }
}
