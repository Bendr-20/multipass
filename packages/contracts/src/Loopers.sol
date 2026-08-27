// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721A} from "erc721a/contracts/ERC721A.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface IERC6551Registry {
    function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId) external view returns (address);
}

contract Loopers is ERC721A, Ownable, Pausable, ReentrancyGuard, ERC2981 {
    using Strings for uint256;

    bytes4 private constant ERC8048_METADATA_INTERFACE_ID = 0xdf670be1;
    string private constant BASE_CHAIN_IDENTIFIER = "0x000100000202210500";
    string private constant ERC721T_BASE_ADDRESS_KEY = "address[0x000100000202210500]";
    string private constant ERC721T_BASE_ACCOUNT_KEY = "account[0x000100000202210500][0]";

    enum SaleState {
        NotStarted,
        Allowlist,
        Public,
        Ended
    }

    uint256 public constant MAX_SUPPLY = 7_777;
    uint256 public constant TEAM_RESERVE = 337;
    uint256 public constant ALLOWLIST_WALLET_LIMIT = 3;
    uint256 public constant PUBLIC_WALLET_LIMIT = 10;
    uint256 public constant MAX_ROYALTY_BPS = 500;
    uint64 public constant ALLOWLIST_DURATION = 1 days;
    uint64 public constant TOTAL_SALE_DURATION = 7 days + 7 hours + 7 minutes + 7 seconds;

    uint64 public allowlistStart;
    uint64 public publicStart;
    uint64 public saleEnd;

    uint256 public allowlistPriceWei;
    uint256 public publicPriceWei;
    bytes32 public merkleRoot;
    address public treasury;

    uint256 public reserveMinted;
    bool public publicSupplyClosed;
    bool public revealed;
    uint256 public revealOffset;

    mapping(address => uint256) public allowlistMintedByWallet;
    mapping(address => uint256) public mintedByWallet;

    string private _placeholderTokenURI;
    string private _finalBaseURI;

    address public erc6551Registry;
    address public erc6551Implementation;
    bytes32 public erc6551Salt;

    mapping(uint256 => mapping(string => bytes)) private _metadata;

    error AllowlistInactive();
    error AlreadyRevealed();
    error BadTreasury();
    error BadERC6551Config();
    error InsufficientPayment();
    error InvalidConfig();
    error InvalidProof();
    error NoBalance();
    error PublicMintInactive();
    error PublicSupplyAlreadyClosed();
    error ReserveExceeded();
    error SaleAlreadyStarted();
    error SaleNotEnded();
    error SoldOut();
    error WalletLimitExceeded();

    event SaleConfigured(uint64 allowlistStart, uint64 publicStart, uint64 saleEnd, uint256 allowlistPriceWei, uint256 publicPriceWei, bytes32 merkleRoot);
    event TreasuryUpdated(address indexed treasury);
    event PricesUpdated(uint256 allowlistPriceWei, uint256 publicPriceWei);
    event MerkleRootUpdated(bytes32 merkleRoot);
    event PlaceholderURIUpdated(string placeholderTokenURI);
    event Revealed(string finalBaseURI, uint256 revealOffset);
    event PublicSupplyClosed(uint256 finalPublicMinted, uint256 totalSupply);
    event Withdrawn(address indexed treasury, uint256 amount);
    event ERC6551ConfigUpdated(address indexed registry, address indexed implementation, bytes32 salt);
    event MetadataSet(uint256 indexed tokenId, string indexed indexedKey, string key, bytes value);

    constructor(
        address initialOwner,
        address initialTreasury,
        string memory placeholderTokenURI_
    ) ERC721A("Loopers", "LOOPER") Ownable(initialOwner) {
        if (initialTreasury == address(0)) revert BadTreasury();
        treasury = initialTreasury;
        _placeholderTokenURI = placeholderTokenURI_;
        _setDefaultRoyalty(initialTreasury, uint96(MAX_ROYALTY_BPS));
    }

    function setSaleConfig(
        uint64 allowlistStart_,
        uint256 allowlistPriceWei_,
        uint256 publicPriceWei_,
        bytes32 merkleRoot_
    ) external onlyOwner onlyBeforeSale {
        if (allowlistStart_ <= block.timestamp) revert InvalidConfig();
        if (publicPriceWei_ == 0 || allowlistPriceWei_ == 0 || allowlistPriceWei_ > publicPriceWei_) revert InvalidConfig();

        allowlistStart = allowlistStart_;
        publicStart = allowlistStart_ + ALLOWLIST_DURATION;
        saleEnd = allowlistStart_ + TOTAL_SALE_DURATION;
        allowlistPriceWei = allowlistPriceWei_;
        publicPriceWei = publicPriceWei_;
        merkleRoot = merkleRoot_;

        emit SaleConfigured(allowlistStart, publicStart, saleEnd, allowlistPriceWei_, publicPriceWei_, merkleRoot_);
    }

    function setPrices(uint256 allowlistPriceWei_, uint256 publicPriceWei_) external onlyOwner onlyBeforeSale {
        if (publicPriceWei_ == 0 || allowlistPriceWei_ == 0 || allowlistPriceWei_ > publicPriceWei_) revert InvalidConfig();
        allowlistPriceWei = allowlistPriceWei_;
        publicPriceWei = publicPriceWei_;
        emit PricesUpdated(allowlistPriceWei_, publicPriceWei_);
    }

    function setMerkleRoot(bytes32 merkleRoot_) external onlyOwner onlyBeforeSale {
        merkleRoot = merkleRoot_;
        emit MerkleRootUpdated(merkleRoot_);
    }

    function setPlaceholderTokenURI(string calldata placeholderTokenURI_) external onlyOwner {
        if (revealed) revert AlreadyRevealed();
        _placeholderTokenURI = placeholderTokenURI_;
        emit PlaceholderURIUpdated(placeholderTokenURI_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert BadTreasury();
        treasury = treasury_;
        _setDefaultRoyalty(treasury_, uint96(MAX_ROYALTY_BPS));
        emit TreasuryUpdated(treasury_);
    }

    function setRoyaltyReceiver(address receiver) external onlyOwner {
        if (receiver == address(0)) revert BadTreasury();
        _setDefaultRoyalty(receiver, uint96(MAX_ROYALTY_BPS));
    }

    function setERC6551Config(address registry, address implementation, bytes32 salt) external onlyOwner {
        if (registry == address(0) || implementation == address(0)) revert BadERC6551Config();
        erc6551Registry = registry;
        erc6551Implementation = implementation;
        erc6551Salt = salt;
        emit ERC6551ConfigUpdated(registry, implementation, salt);
    }

    function setMetadata(uint256 tokenId, string calldata key, bytes calldata value) external onlyOwner {
        if (!_exists(tokenId)) revert URIQueryForNonexistentToken();
        _metadata[tokenId][key] = value;
        emit MetadataSet(tokenId, key, key, value);
    }

    function allowlistMint(uint256 quantity, bytes32[] calldata proof) external payable whenNotPaused nonReentrant {
        if (saleState() != SaleState.Allowlist) revert AllowlistInactive();
        if (!MerkleProof.verify(proof, merkleRoot, _leaf(msg.sender))) revert InvalidProof();
        if (allowlistMintedByWallet[msg.sender] + quantity > ALLOWLIST_WALLET_LIMIT) revert WalletLimitExceeded();
        if (msg.value != allowlistPriceWei * quantity) revert InsufficientPayment();

        _consumePublicSupply(quantity);
        allowlistMintedByWallet[msg.sender] += quantity;
        mintedByWallet[msg.sender] += quantity;
        _safeMint(msg.sender, quantity);
    }

    function publicMint(uint256 quantity) external payable whenNotPaused nonReentrant {
        if (saleState() != SaleState.Public) revert PublicMintInactive();
        if (mintedByWallet[msg.sender] + quantity > PUBLIC_WALLET_LIMIT) revert WalletLimitExceeded();
        if (msg.value != publicPriceWei * quantity) revert InsufficientPayment();

        _consumePublicSupply(quantity);
        mintedByWallet[msg.sender] += quantity;
        _safeMint(msg.sender, quantity);
    }

    function reserveMint(address to, uint256 quantity) external onlyOwner {
        if (to == address(0)) revert BadTreasury();
        if (reserveMinted + quantity > TEAM_RESERVE) revert ReserveExceeded();
        if (_totalMinted() + quantity > MAX_SUPPLY) revert SoldOut();

        reserveMinted += quantity;
        _safeMint(to, quantity);
    }

    function reveal(string calldata finalBaseURI_, uint256 revealOffset_) external onlyOwner {
        if (revealed) revert AlreadyRevealed();
        if (publicStart == 0 || block.timestamp < publicStart) revert InvalidConfig();
        if (bytes(finalBaseURI_).length == 0) revert InvalidConfig();

        _finalBaseURI = finalBaseURI_;
        revealOffset = revealOffset_ % MAX_SUPPLY;
        revealed = true;
        emit Revealed(finalBaseURI_, revealOffset);
    }

    function closePublicSupply() external onlyOwner {
        if (saleEnd == 0 || block.timestamp < saleEnd) revert SaleNotEnded();
        publicSupplyClosed = true;
        emit PublicSupplyClosed(publicMinted(), totalSupply());
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdraw() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoBalance();

        (bool success,) = treasury.call{value: balance}("");
        require(success, "ETH_TRANSFER_FAILED");
        emit Withdrawn(treasury, balance);
    }

    function saleState() public view returns (SaleState) {
        if (allowlistStart == 0 || block.timestamp < allowlistStart) return SaleState.NotStarted;
        if (block.timestamp < publicStart) return SaleState.Allowlist;
        if (publicSupplyClosed || block.timestamp >= saleEnd || remainingPublicSupply() == 0) return SaleState.Ended;
        return SaleState.Public;
    }

    function remainingSupply() public view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }

    function remainingPublicSupply() public view returns (uint256) {
        uint256 publicCap = MAX_SUPPLY - TEAM_RESERVE + reserveMinted;
        uint256 minted = totalSupply();
        if (minted >= publicCap) return 0;
        return publicCap - minted;
    }

    function publicMinted() public view returns (uint256) {
        return totalSupply() - reserveMinted;
    }

    function totalMinted() external view returns (uint256) {
        return totalSupply();
    }

    function metadata(uint256 tokenId, string calldata key) external view returns (bytes memory) {
        if (!_exists(tokenId)) revert URIQueryForNonexistentToken();

        bytes32 keyHash = keccak256(bytes(key));
        if (keyHash == keccak256(bytes(ERC721T_BASE_ADDRESS_KEY))) {
            return abi.encodePacked(ownerOf(tokenId));
        }
        if (keyHash == keccak256(bytes(ERC721T_BASE_ACCOUNT_KEY))) {
            address account = tokenBoundAccount(tokenId);
            return account == address(0) ? bytes("") : abi.encodePacked(account);
        }
        return _metadata[tokenId][key];
    }

    function tokenBoundAccount(uint256 tokenId) public view returns (address) {
        if (!_exists(tokenId)) revert URIQueryForNonexistentToken();
        if (erc6551Registry == address(0) || erc6551Implementation == address(0)) return address(0);
        return IERC6551Registry(erc6551Registry).account(
            erc6551Implementation,
            erc6551Salt,
            block.chainid,
            address(this),
            tokenId
        );
    }

    function baseChainIdentifier() external pure returns (string memory) {
        return BASE_CHAIN_IDENTIFIER;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert URIQueryForNonexistentToken();
        if (!revealed) return _placeholderTokenURI;

        uint256 metadataId = ((tokenId - 1 + revealOffset) % MAX_SUPPLY) + 1;
        return string.concat(_finalBaseURI, metadataId.toString(), ".json");
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721A, ERC2981) returns (bool) {
        return interfaceId == ERC8048_METADATA_INTERFACE_ID || ERC721A.supportsInterface(interfaceId) || ERC2981.supportsInterface(interfaceId);
    }

    function _startTokenId() internal pure override returns (uint256) {
        return 1;
    }

    function _consumePublicSupply(uint256 quantity) private view {
        if (publicSupplyClosed) revert PublicSupplyAlreadyClosed();
        if (quantity == 0) revert InvalidConfig();
        if (quantity > remainingPublicSupply()) revert SoldOut();
    }

    function _leaf(address account) private pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account))));
    }

    modifier onlyBeforeSale() {
        if (allowlistStart != 0 && block.timestamp >= allowlistStart) revert SaleAlreadyStarted();
        _;
    }
}
