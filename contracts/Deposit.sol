// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "fhevm/lib/TFHE.sol";

import "fhevm/gateway/GatewayCaller.sol";
import "fhevm/config/ZamaFHEVMConfig.sol";
import "fhevm/config/ZamaGatewayConfig.sol";
import { IConfidentialERC20 } from "fhevm-contracts/contracts/token/ERC20/IConfidentialERC20.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IAavePool } from "./IAavePool.sol";
import { ConfidentialLending } from "./ConfidentialLending.sol";
import { ConfidentialLendingToken } from "./ConfidentialLendingToken.sol";

import "hardhat/console.sol";

contract Deposit is SepoliaZamaFHEVMConfig {
    address public immutable lendingContract;
    address public immutable aavePool;

    mapping(eaddress depositor => mapping(address token => euint64 amount)) public deposits;
    mapping(eaddress depositor => mapping(address token => euint64 amount)) public supplyToLending;

    event FundsDeposited(eaddress depositor, address token, euint64 amount);
    event FundsSupplied(eaddress depositor, address token, euint64 amount);
    event FundsWithdrawn(eaddress depositor, address token, euint64 amount);
    event FundsSuppliedModified(eaddress depositor, address token, euint64 newAmount);

    error NotLendingContract();
    error NotAllowedToAccess();

    modifier onlyLendingContract() {
        if (msg.sender != lendingContract) {
            revert NotLendingContract();
        }
        _;
    }

    constructor(address _lendingContract, address _aavePool) {
        lendingContract = _lendingContract;
        aavePool = _aavePool;
    }

    // only normal tokens are allowed since aave can not handle confidential tokens
    function depositToken(address _token, uint64 _amount) public {
        // encrypt the inputs
        eaddress depositor = TFHE.asEaddress(msg.sender);
        euint64 amount = TFHE.asEuint64(_amount);

        // store the deposits
        euint64 newDepositAmount = TFHE.add(deposits[depositor][_token], amount);

        TFHE.allowThis(newDepositAmount);
        TFHE.allow(newDepositAmount, msg.sender);
        // TFHE.allow(newDepositAmount, lendingContract);
        deposits[depositor][_token] = newDepositAmount;

        // get the assets from the user
        IERC20(_token).transferFrom(msg.sender, address(this), _amount);

        emit FundsDeposited(depositor, _token, amount);
    }

    // to supply the assets to the lending contract (those token won't longer be able to withdraw)
    function supply(address _token, einput _amount, bytes calldata _inputProof) public {
        // validate the inputs
        euint64 amount = TFHE.asEuint64(_amount, _inputProof);
        // eaddress token = TFHE.asEaddress(_token, _inputProof);

        // encrypt the depositor
        eaddress depositor = TFHE.asEaddress(msg.sender);

        // check if the user has enough deposits
        ebool hasEnoughDeposits = TFHE.ge(deposits[depositor][_token], amount);
        euint64 supplyAmount = TFHE.select(hasEnoughDeposits, amount, TFHE.asEuint64(0));

        euint64 newSupplyAmount = TFHE.add(supplyToLending[depositor][_token], supplyAmount);

        // allowing lending contract since it needs it to be able to decrease the user supply
        TFHE.allowThis(newSupplyAmount);
        TFHE.allow(newSupplyAmount, msg.sender);
        TFHE.allow(newSupplyAmount, lendingContract);

        // store the supply
        supplyToLending[depositor][_token] = newSupplyAmount;

        // remove the assets from the deposit
        euint64 newDepositAmount = TFHE.sub(deposits[depositor][_token], supplyAmount);
        TFHE.allowThis(newDepositAmount);
        TFHE.allow(newDepositAmount, msg.sender);
        deposits[depositor][_token] = newDepositAmount;

        emit FundsSupplied(depositor, _token, supplyAmount);
    }

    // to withdraw the assets from this contract (if has not enough deposits won't withdraw anything)
    function withdraw(address _token, uint64 _amount) public {
        // encrypt the inputs
        eaddress depositor = TFHE.asEaddress(msg.sender);
        euint64 amount = TFHE.asEuint64(_amount);

        // check if the user has enough deposits
        ebool hasEnoughDeposits = TFHE.ge(deposits[depositor][_token], amount);
        euint64 withdrawAmount = TFHE.select(hasEnoughDeposits, amount, TFHE.asEuint64(0));

        // remove the assets from the deposit
        deposits[depositor][_token] = TFHE.sub(deposits[depositor][_token], withdrawAmount);

        // transfer the assets to the user
        IERC20(_token).transfer(msg.sender, _amount);

        emit FundsWithdrawn(depositor, _token, amount);
    }

    function getDeposit(eaddress _depositor, address _token) public view returns (euint64 depositAmount) {
        depositAmount = deposits[_depositor][_token];

        if (!TFHE.isSenderAllowed(depositAmount)) {
            revert NotAllowedToAccess();
        }
    }

    function getSupplyToLending(eaddress _depositor, address _token) public view returns (euint64 supplyAmount) {
        supplyAmount = supplyToLending[_depositor][_token];

        if (!TFHE.isSenderAllowed(supplyAmount)) {
            revert NotAllowedToAccess();
        }
    }

    // ===== Only Lending Contract allowed =====
    function supplyOnAave(address _token, uint64 _amount) public onlyLendingContract {
        // approve tokens to aave pool
        IERC20(_token).approve(aavePool, _amount);

        // supply tokens to aave pool
        IAavePool(aavePool).supply(_token, _amount, address(this), 0);
    }

    // NOTE: receives the already decreased value because otherwise cant allow depositor to access it
    function decreaseUserSupply(
        eaddress _depositor,
        address _token,
        euint64 _newSupplyAmount
    ) public onlyLendingContract {
        TFHE.allowThis(_newSupplyAmount);
        TFHE.allow(_newSupplyAmount, lendingContract);

        // depositor is already allowed
        supplyToLending[_depositor][_token] = _newSupplyAmount;

        emit FundsSuppliedModified(_depositor, _token, _newSupplyAmount);
    }
}
