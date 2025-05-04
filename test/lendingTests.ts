import { expect } from "chai";
import { network } from "hardhat";
import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { createInstance } from "./instance";
import { reencryptEuint64, reencryptEaddress } from "./reencrypt";
import { getSigners, initSigners } from "./signers";
// import { deployConfidentialERC20Fixture } from "./ConfidentialERC20.fixture";

import { awaitAllDecryptionResults, initGateway } from "./asyncDecrypt";
import { impersonateAddress } from "./mockedSetup";


describe("MyTests", function () {
  before(async function () {
    await initSigners();
    this.signers = await getSigners();
    await initGateway();
    this.hre = require("hardhat");
  });

  beforeEach(async function () {
    // const signers = await getSigners();

    const aavePoolFactory = await ethers.getContractFactory("MyAavePool");
    const aavePool = await aavePoolFactory.connect(this.signers.alice).deploy(); // aave pool contract
    await aavePool.waitForDeployment();

    const contractFactory = await ethers.getContractFactory("ConfidentialLending");
    const contract = await contractFactory.connect(this.signers.alice).deploy(aavePool.getAddress()); // lending contract
    await contract.waitForDeployment();

    const deposit = await contract.deposit();

    const depositContractFactory = await ethers.getContractFactory("Deposit");
    const depositContract= await depositContractFactory.connect(this.signers.alice).attach(deposit);

    const confidentialLendingToken = await contract.confidentialLendingToken();

    const confidentialERC20Factory = await ethers.getContractFactory("ConfidentialLendingToken");
    const erc20 = await confidentialERC20Factory.connect(this.signers.alice).attach(confidentialLendingToken);


    const myERC20Factory = await ethers.getContractFactory("MockToken");
    const myERC20 = await myERC20Factory.connect(this.signers.alice).deploy("MyERC20", "MRC20", 1000);
    await myERC20.waitForDeployment();

    this.fhevm = await createInstance();
    this.lendingContract = contract;
    this.lendingContractAddress = await contract.getAddress();
    this.lendingERC20 = erc20;
    this.lendingERC20Address = await erc20.getAddress();
    this.depositContract = depositContract;
    this.depositContractAddress = await depositContract.getAddress();
    this.aavePool = aavePool;
    this.aavePoolAddress = await aavePool.getAddress();
    this.myERC20 = myERC20;
    this.myERC20Address = await myERC20.getAddress();

    console.log("lendingContractAddress", this.lendingContractAddress)
    console.log("lendingERC20Address", this.lendingERC20Address)
    console.log("depositContractAddress", this.depositContractAddress)
    console.log("aavePoolAddress", this.aavePoolAddress)
    console.log("myERC20Address", this.myERC20Address)
  });

  it("mine", async function () {
    const aliceBalance = 1000;
    const depositAmount = 100;
    const supplyAmount = 10;
    const amountAaveRequest = 5;



    // balance of alice in mytoken is 1000
    const balanceAlice = await this.myERC20.balanceOf(this.signers.alice);
    expect(balanceAlice).to.equal(aliceBalance, "balance of alice in mytoken should be 1000")


    // approve to deposit on behalf of alice
    const txApprove = await this.myERC20.approve(this.depositContractAddress, depositAmount);
    await txApprove.wait();

    // deposit 100 tokens on Deposit contract

    const txDeposit = await this.depositContract.depositToken(
      this.myERC20Address,
      depositAmount,
    );
    const receiptDeposit = await txDeposit.wait();

    // read event
    const event = readEvent(receiptDeposit, "FundsDeposited");

    expect(event).to.not.equal(undefined, "event should be found")

    console.log("--------------------------------", event?.args[0])
    // check deposit
    const depositHandle = await this.depositContract.getDeposit(
      event?.args[0], // depositor
      this.myERC20Address
    );
    const userDeposit = await reencryptEuint64(
      this.signers.alice,
      this.fhevm,
      depositHandle,
      this.depositContractAddress,
    );
    console.log("userDeposit", userDeposit)
    // expect(userDeposit).to.equal(depositAmount, "deposit should be 100")


    // supply 10 tokens on Deposit contract
    const inputSupply = this.fhevm.createEncryptedInput(this.depositContractAddress, this.signers.alice.address);
    inputSupply.add64(supplyAmount);
    const encryptSupply = await inputSupply.encrypt();

    const txSupply = await this.depositContract.supply(
      this.myERC20Address,
      encryptSupply.handles[0],
      encryptSupply.inputProof,
    );
    const receiptSupply = await txSupply.wait();

    // read event
    const eventSupply = readEvent(receiptSupply, "FundsSupplied");

    expect(eventSupply).to.not.equal(undefined, "event should be found")

    // check deposit
    const supplyHandle = await this.depositContract.getSupplyToLending(
      eventSupply?.args[0], // depositor
      this.myERC20Address
    );

    const depositHandleAfterSupply = await this.depositContract.getDeposit(
      event?.args[0], // depositor
      this.myERC20Address
    );

    const userSupply = await reencryptEuint64(
      this.signers.alice,
      this.fhevm,
      supplyHandle,
      this.depositContractAddress,
    );

    const userDepositAfterSupply = await reencryptEuint64(
      this.signers.alice,
      this.fhevm,
      depositHandleAfterSupply,
      this.depositContractAddress,
    );

    expect(userSupply).to.equal(supplyAmount, "supply should be 10")
    expect(userDepositAfterSupply).to.equal(depositAmount - supplyAmount, "deposit should be 90")


    // encprypt input for request supply
    const input = this.fhevm.createEncryptedInput(this.lendingContractAddress, this.signers.alice.address);
    input.add64(amountAaveRequest);
    const encryptedTransferAmount = await input.encrypt();

    // request supply
    const tx = await this.lendingContract.requestSupply(
      this.myERC20Address,
      encryptedTransferAmount.handles[0],
      encryptedTransferAmount.inputProof,
    );
    const receipt = await tx.wait();
    const requestIDHandle = getRequestID(receipt)
    const requestID = await reencryptEuint64(
      this.signers.alice,
      this.fhevm,
      requestIDHandle,
      this.lendingContractAddress,
    );

    console.log("requestID", requestID);

    const isPending = await this.lendingContract.isRequestPending(requestIDHandle)
    expect(isPending).to.equal(true, "request should be pending")

    const request = await this.lendingContract.getRequest(requestIDHandle)
    const user = await reencryptEaddress(
      this.signers.alice,
      this.fhevm,
      request.user,
      this.lendingContractAddress,
    );
    const asset = await reencryptEaddress(
      this.signers.alice,
      this.fhevm,
      request.asset,
      this.lendingContractAddress,
    );
    const amount = await reencryptEuint64(
      this.signers.alice,
      this.fhevm,
      request.amount,
      this.lendingContractAddress,
    );
    expect(user.toLowerCase()).to.equal(this.signers.alice.address.toLowerCase(), "user should be alice")
    expect(asset.toLowerCase()).to.equal(this.myERC20Address.toLowerCase(), "asset should be myERC20")
    expect(amount).to.equal(amountAaveRequest, "amount should be 10")


    // execute the supply request
    const txExecute = await this.lendingContract.processRequest(requestIDHandle)
    await txExecute.wait();


    await awaitAllDecryptionResults();


    const isPendingAfter = await this.lendingContract.isRequestPending(requestIDHandle)
    expect(isPendingAfter).to.equal(false, "request should not be pending")

    // check the balance of alice in mytoken is 900
    const balanceAliceAfter = await this.myERC20.balanceOf(this.signers.alice);
    expect(balanceAliceAfter).to.equal(aliceBalance - depositAmount, "balance of alice in mytoken should be 900")

    // check the deposits and supply of alice
    const supplyHandleAfterRequest = await this.depositContract.getSupplyToLending(
      eventSupply?.args[0], // depositor
      // eventSupply?.args[1], // token
      this.myERC20Address
    );

    const depositHandleAfterSupplyRequest = await this.depositContract.getDeposit(
      event?.args[0], // depositor
      // event?.args[1], // token
      this.myERC20Address
    );

    const aliceAddressEncrypted = event?.args[0];

    const userSupplyAfter = await reencryptEuint64(
      this.signers.alice,
      this.fhevm,
      supplyHandleAfterRequest,
      this.depositContractAddress,
    );

    const userDepositAfterSupplyRequest = await reencryptEuint64(
      this.signers.alice,
      this.fhevm,
      depositHandleAfterSupplyRequest,
      this.depositContractAddress,
    );


    expect(userSupplyAfter).to.equal(supplyAmount - amountAaveRequest, "supply should be 0")
    expect(userDepositAfterSupplyRequest).to.equal(depositAmount - supplyAmount, "deposit should be the same")


    // check Deposit has alice tokens
    const depositBalance = await this.myERC20.balanceOf(this.depositContractAddress);
    expect(depositBalance).to.equal(depositAmount - amountAaveRequest, "deposit balance should be the same")

    // check aave pool has supply request tokens
    const aavePoolBalance = await this.myERC20.balanceOf(this.aavePoolAddress);
    expect(aavePoolBalance).to.equal(amountAaveRequest, "aave pool balance should be the same")

    // check alice has not confidential tokens // ! it says is not initialized which means is zero, look for how test this
    // const balanceHandleAlice = await this.lendingERC20.balanceOf(this.signers.alice);
    // console.log("here1343242")
    // const confidentialAliceBalance = await reencryptEuint64(
    //   this.signers.alice,
    //   this.fhevm,
    //   balanceHandleAlice,
    //   this.lendingERC20Address,
    // );
    // expect(confidentialAliceBalance).to.equal(0, "balance of alice in mytoken should be 0")

    // check alice has endorsements
    const endorsementsHandle = await this.lendingERC20.getEndorsements(aliceAddressEncrypted);

    const endorsement = await reencryptEuint64(
      this.signers.alice,
      this.fhevm,
      endorsementsHandle,
      this.lendingERC20Address,
    );
    expect(endorsement).to.equal(amountAaveRequest, "endorsements should be the same")

    // claim the endorsement for alice
    const txClaim = await this.lendingERC20.claim()
    await txClaim.wait();

    const balanceHandleAliceAfterClaim = await this.lendingERC20.balanceOf(this.signers.alice);
    const balanceAliceAfterClaim = await reencryptEuint64(
      this.signers.alice,
      this.fhevm,
      balanceHandleAliceAfterClaim,
      this.lendingERC20Address,
    );

    expect(balanceAliceAfterClaim).to.equal(amountAaveRequest, "balance of alice in mytoken should be 0")


    // check endorsement is zero
    const endorsementsAfrerClaimHandle = await this.lendingERC20.getEndorsements(aliceAddressEncrypted);

    const endorsementAfterClaim = await reencryptEuint64(
      this.signers.alice,
      this.fhevm,
      endorsementsAfrerClaimHandle,
      this.lendingERC20Address,
    );
    expect(endorsementAfterClaim).to.equal(0, "endorsements should be 0")



    // expect(2).to.equal(5, "deposit should be the same")
  });
});


function getRequestID(receipt: any) {
  const event = receipt.logs.find((log: any) => {
    // Check if this is the SupplyRequested event
    return log.fragment && log.fragment.name === 'SupplyRequested';
  });
  return event?.args[0];
}

function readEvent(receipt: any, eventName: string) {
  const event = receipt.logs.find((log: any) => {
    // Check if this is the SupplyRequested event
    return log.fragment && log.fragment.name === eventName;
  });
  return event;
}
