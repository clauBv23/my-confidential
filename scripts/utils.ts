import { reencryptEuint64, reencryptEaddress } from "../test/reencrypt";

export async function requestSupply(lendingContract, token, amount, fhevm, user ) {
  const tokenAddress = await token.getAddress();

  const input = fhevm.createEncryptedInput(await lendingContract.getAddress(), user);
  input.add64(amount);
  const encryptedTransferAmount = await input.encrypt();

  const txRequest = await lendingContract.requestSupply(
    tokenAddress,
    encryptedTransferAmount.handles[0],
    encryptedTransferAmount.inputProof
  );
  const receipt = await txRequest.wait();
  return receipt;
}

export async function processRequest(lendingContract, requestIDHandle ) {
    const txExecute = await lendingContract.processRequest(requestIDHandle);
    const receipt = await txExecute.wait();
    return receipt;
}

export async function depositToken(depositContract, token, depositAmount ) {
  const depositAddress = await depositContract.getAddress();
  const tokenAddress = await token.getAddress();

  await token.approve(depositAddress, depositAmount);
  const txDeposit = await depositContract.depositToken(
    tokenAddress,
    depositAmount,
    { gasLimit: 1000000 }
  );
  const receiptDeposit = await txDeposit.wait();
  return receiptDeposit;
}

export async function supplyTokenToLend(depositContract, tokenAddress, supplyAmount:number, fhevm, user ) {
  const depositAddress = await depositContract.getAddress();
  const inputSupply = fhevm.createEncryptedInput(depositAddress, user);
  inputSupply.add64(supplyAmount);

  const encryptSupply = await inputSupply.encrypt();

  const txSupply = await depositContract.supply(
    tokenAddress,
    encryptSupply.handles[0],
    encryptSupply.inputProof
  );
  const receiptSupply = await txSupply.wait();
  return receiptSupply;
}

export async function getDeposit(depositContract, depositorEncrypted, depositedToken, fhevm, signer ) {
  const depositAddress = await depositContract.getAddress();

  const depositHandle = await depositContract.getDeposit(
    depositorEncrypted,
    depositedToken,
    { gasLimit: 1000000 }
    );
  const userDeposit = await reencryptEuint64(
    signer,
    fhevm,
    depositHandle,
    depositAddress,
  );
  return userDeposit;
}

export async function getSupply(depositContract, depositorEncrypted, depositedToken, fhevm, signer ) {
  const depositAddress = await depositContract.getAddress();

     const supplyHandle = await depositContract.getSupplyToLending(
      depositorEncrypted,
      depositedToken,
      { gasLimit: 1000000 }
    );

    const userSupply = await reencryptEuint64(
      signer,
      fhevm,
      supplyHandle,
      depositAddress,
    );
    return userSupply;
}

export async function isRequestPending(lendingContract, requestIDHandle ) {
  const request = await lendingContract.isRequestPending(requestIDHandle)
  return request;
}

export async function getRequest(lendingContract, requestIDHandle, fhevm, signer ) {
  const contractAddress = await lendingContract.getAddress();

  const request = await lendingContract.getRequest(requestIDHandle)
    const user = await reencryptEaddress(
      signer,
      fhevm,
      request.user,
      contractAddress
    );
    const asset = await reencryptEaddress(
      signer,
      fhevm,
      request.asset,
      contractAddress
    );
    const amount = await reencryptEuint64(
      signer,
      fhevm,
      request.amount,
      contractAddress
    );

    return {
      user,
      asset,
      amount,
      isPending: request.isPending
    }
}

export async function getEndorsement(endorsedToken, userEncryptedHandle, fhevm, signer ) {
  const tokenContractAddress = await endorsedToken.getAddress();

  const endorsementHandle = await endorsedToken.getEndorsements(BigInt(userEncryptedHandle));
  const endorsement = await reencryptEuint64(
    signer,
    fhevm,
    endorsementHandle,
    tokenContractAddress,
  );

  return endorsement;
}

export async function getConfidentialBalance(tokenContract, userEncrypted, fhevm, signer) {
  const tokenContractAddress = await tokenContract.getAddress();
  const balanceHandle = await tokenContract.balanceOf(userEncrypted);
  const balance = await reencryptEuint64(
    signer,
    fhevm,
    balanceHandle,
    tokenContractAddress,
  );
  return balance;
}

export async function claimLending(lendingContract ) {
  const txClaim = await lendingContract.claim();
  const receiptClaim = await txClaim.wait();
  return receiptClaim;
}

export async function withdrawFromDeposit(depositContract, tokenAddress, amount ) {
  const txWithdraw = await depositContract.withdraw(tokenAddress, amount);
  const receiptWithdraw = await txWithdraw.wait();
  return receiptWithdraw;
}

export function getRequestID(receipt: any) {
  const event = receipt.logs.find((log: any) => {
    // Check if this is the SupplyRequested event
    return log.fragment && log.fragment.name === 'SupplyRequested';
  });
  return event?.args[0];
}

export function readEvent(receipt: any, eventName: string) {
  const event = receipt.logs.find((log: any) => {
    // Check if this is the SupplyRequested event
    return log.fragment && log.fragment.name === eventName;
  });
  return event;
}

