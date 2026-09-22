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

contract LooperAgentAccount is IERC165, IERC1271, IERC6551Account, IERC6551Executable {
    bytes4 private constant _ERC1271_MAGIC = IERC1271.isValidSignature.selector;
    bytes4 private constant _INVALID_MAGIC = 0xffffffff;
    bytes4 private constant _COMBINED_INTERFACE_ID = 0xb39e6aed;
    bytes10 private constant _PROXY_PREFIX = 0x363d3d373d3d3d363d73;
    bytes15 private constant _PROXY_SUFFIX = 0x5af43d82803e903d91602b57fd5bf3;
    uint256 private constant _PROXY_RUNTIME_LENGTH = 173;
    uint256 private constant _TOKEN_FOOTER_OFFSET = 77;

    address private immutable _implementation = address(this);

    uint256 public state;

    error InvalidOperation(uint8 operation);
    error InvalidSigner(address caller, address owner);

    event StateUpdated(uint256 indexed state);

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
