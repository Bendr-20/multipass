// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IProjectOwnedCollection {
    function owner() external view returns (address);
}

contract LooperAgentModuleRegistry {
    address public immutable collection;
    bool public globallyPaused = true;
    mapping(address => bytes32) public approvedModuleCodehash;

    error InvalidCollection(address collection);
    error InvalidProjectOwner();
    error Unauthorized(address caller, address owner);
    error InvalidModule(address module);
    error InvalidCodehash(bytes32 expected, bytes32 actual);

    event GlobalPauseChanged(bool paused);
    event ModuleApprovalChanged(address indexed module, bytes32 codehash);

    constructor(address collection_) {
        if (collection_ == address(0) || collection_.code.length == 0) {
            revert InvalidCollection(collection_);
        }
        collection = collection_;
    }

    function setGlobalPause(bool paused) external {
        _requireProjectOwner();
        globallyPaused = paused;
        emit GlobalPauseChanged(paused);
    }

    function approveModule(address module, bytes32 expectedCodehash) external {
        _requireProjectOwner();
        if (module == address(0) || module.code.length == 0 || expectedCodehash == bytes32(0)) {
            revert InvalidModule(module);
        }

        bytes32 actualCodehash = module.codehash;
        if (actualCodehash != expectedCodehash) {
            revert InvalidCodehash(expectedCodehash, actualCodehash);
        }

        approvedModuleCodehash[module] = actualCodehash;
        emit ModuleApprovalChanged(module, actualCodehash);
    }

    function removeModule(address module) external {
        _requireProjectOwner();
        approvedModuleCodehash[module] = bytes32(0);
        emit ModuleApprovalChanged(module, bytes32(0));
    }

    function _requireProjectOwner() private view {
        (bool success, bytes memory result) = collection.staticcall{gas: 30_000}(
            abi.encodeWithSelector(IProjectOwnedCollection.owner.selector)
        );
        if (!success || result.length != 32) revert InvalidProjectOwner();

        uint256 ownerWord;
        assembly {
            ownerWord := mload(add(result, 0x20))
        }
        if (ownerWord == 0 || ownerWord >> 160 != 0) revert InvalidProjectOwner();

        address currentOwner = address(uint160(ownerWord));
        if (msg.sender != currentOwner) revert Unauthorized(msg.sender, currentOwner);
    }
}
