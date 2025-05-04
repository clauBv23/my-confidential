// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "fhevm/lib/TFHE.sol";

import "fhevm/gateway/GatewayCaller.sol";
import "fhevm/config/ZamaFHEVMConfig.sol";
import "fhevm/config/ZamaGatewayConfig.sol";

import "hardhat/console.sol";

import { ConfidentialLendingToken } from "./ConfidentialLendingToken.sol";

import { Deposit } from "./Deposit.sol";

contract ConfidentialLending is SepoliaZamaFHEVMConfig, SepoliaZamaGatewayConfig, GatewayCaller {
    // todo check the sizes to pack
    struct Request {
        bool isPending;
        eaddress user;
        eaddress asset;
        euint64 amount;
    }

    mapping(euint64 requestID => Request request) private requests;

    address public deposit;
    address public confidentialLendingToken;

    event SupplyRequested(euint64 requestID);
    event SupplyRequestDecryptionRequested(euint64 requestID, uint256 gatewayRequestID);

    error RequestProcessed();
    error NotAllowedToAccess();

    constructor(address _aavePool) {
        // todo think on a reasonable initial supply
        confidentialLendingToken = address(
            new ConfidentialLendingToken("ConfidentialLendingToken", "CLT", type(uint64).max)
        );

        deposit = address(new Deposit(address(this), _aavePool));
    }

    // stores the supply requests
    function requestSupply(
        address asset,
        einput encryptedAmount,
        bytes calldata inputProof
    ) public returns (euint64 requestID) {
        // Validate and convert the encrypted inputs
        euint64 amount = TFHE.asEuint64(encryptedAmount, inputProof);

        // calculate the request id
        requestID = _generateNewRandomRequestID();

        // store the request
        requests[requestID] = Request({
            isPending: true,
            user: TFHE.asEaddress(msg.sender),
            asset: TFHE.asEaddress(asset),
            amount: amount
        });

        // allow this contract and owner to use pending request values
        TFHE.allowThis(requestID);
        TFHE.allowThis(requests[requestID].user);
        TFHE.allowThis(requests[requestID].asset);
        TFHE.allowThis(requests[requestID].amount);

        TFHE.allow(requestID, msg.sender);
        TFHE.allow(requests[requestID].user, msg.sender);
        TFHE.allow(requests[requestID].asset, msg.sender);
        TFHE.allow(requests[requestID].amount, msg.sender);

        emit SupplyRequested(requestID);
    }

    function getRequest(euint64 requestID) public view returns (Request memory) {
        // check caller has permission to read the request
        if (!TFHE.isSenderAllowed(requestID)) {
            revert NotAllowedToAccess();
        }

        return requests[requestID];
    }

    function isRequestPending(euint64 requestID) public view returns (bool) {
        // check caller has permission to read the request
        if (!TFHE.isSenderAllowed(requestID)) {
            revert NotAllowedToAccess();
        }

        return requests[requestID].isPending;
    }

    // -------------------------Process Requests-----------------------------------

    // stores the supply pending requests
    function processRequest(euint64 requestID) public {
        // ! not checking the caller can access the requestID since I want to everyone be able to execute others requests
        Request memory request = requests[requestID];

        //  check the request is pending
        if (!request.isPending) {
            revert RequestProcessed();
        }

        // call gateway to decode
        uint256[] memory cts = new uint256[](3);
        cts[0] = Gateway.toUint256(request.user);
        cts[1] = Gateway.toUint256(request.asset);
        cts[2] = Gateway.toUint256(request.amount);
        uint256 gatewayRequestID = Gateway.requestDecryption(
            cts,
            this.supplyCallback.selector,
            0,
            block.timestamp + 100,
            false
        );
        addParamsEUint64(gatewayRequestID, requestID);

        emit SupplyRequestDecryptionRequested(requestID, gatewayRequestID);
    }

    function supplyCallback(uint256 gatewayRequestID, address user, address asset, uint64 amount) public {
        /**
         * 1- mark request as executed
         * 2- check if Deposit has enough supply
         * 3- decrease the supply to lending on Deposit
         * 4- endorse lending tokens to the user based on if has enough supply
         * 5- supply on aave based on the amount to endorse
         */

        // get the requestID from the params
        euint64[] memory params = getParamsEUint64(gatewayRequestID);
        euint64 requestID = params[0];

        // step 1
        _setRequestAsProcessed(requestID);

        // step 2
        euint64 amountToTransfer = TFHE.asEuint64(amount);
        eaddress encryptedUser = TFHE.asEaddress(user);

        euint64 supplyToLending = Deposit(deposit).getSupplyToLending(encryptedUser, asset);
        ebool hasEnoughSupply = TFHE.ge(supplyToLending, amountToTransfer);

        // step 3
        euint64 amountToEndorse = TFHE.select(hasEnoughSupply, amountToTransfer, TFHE.asEuint64(0));

        // calculate final value here otherwise won't be able to allow the user to read the value
        euint64 newSupplyToLending = TFHE.sub(supplyToLending, amountToEndorse);
        TFHE.allowTransient(newSupplyToLending, deposit);
        TFHE.allow(newSupplyToLending, user); // ! allow user at this point because don't know its value in the deposit contract
        Deposit(deposit).decreaseUserSupply(encryptedUser, asset, newSupplyToLending);

        // calculate here the new endorsement otherwise won't be able to allow the user to read the value
        euint64 newEndorseAmount = TFHE.add(
            amountToEndorse,
            ConfidentialLendingToken(confidentialLendingToken).getEndorsements(encryptedUser)
        );
        TFHE.allowTransient(newEndorseAmount, confidentialLendingToken);
        TFHE.allow(newEndorseAmount, user); // ! allow user at this point because don't know its value in the deposit contract
        ConfidentialLendingToken(confidentialLendingToken).endorse(encryptedUser, newEndorseAmount);

        // step 4
        // todo this is wrong if has not enough deposits should supply 0 can't find a way to do this
        Deposit(deposit).supplyOnAave(asset, amount);
    }

    // function getMyHandle() public view returns (eaddress) {
    //     return TFHE.asEaddress(msg.sender);
    // }

    // utils

    function _setRequestAsProcessed(euint64 requestID) internal {
        requests[requestID].isPending = false;
    }

    // there should be low probabilities that the requestID is already used
    function _generateNewRandomRequestID() internal returns (euint64) {
        euint64 requestID = TFHE.randEuint64();
        while (requests[requestID].isPending) {
            requestID = TFHE.randEuint64();
        }
        return requestID;
    }
}
