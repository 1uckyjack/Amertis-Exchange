import { config } from "@/config";
import { abi as routerAbi } from "@/config/monagRouterAbi";
import { abi as tokenAbi } from "@/config/basicTokenAbi";
import { StaticImageData } from "next/image";
import { useEffect, useState } from "react";
import { formatUnits, maxUint256, parseEther, parseUnits } from "viem";
import { useAccount, useReadContracts, useWriteContract } from "wagmi";
import { toast } from "react-toastify";
import { calculateSlippageAdjustedOutput } from "@/utils/helper";

type TokenData = {
  icon: StaticImageData;
  name: string;
  ca: string;
  ticker: string;
  tokenBalance: number | undefined;
  inputValue: string;
  price: string;
  decimals: number;
};

type SwapData = {
  adapters: string[];
  amounts: bigint[];
  amountOut: bigint;
  baseForQuote: bigint;
  gasEstimate: bigint;
  path: string[];
  status: string;
};

const UseSwap = (baseToken: TokenData, quoteToken: TokenData) => {
  const fee = BigInt(3); // Fee represented in 1e4 format
  const FEE_DENOMINATOR = BigInt(1e4);
  const { address: userAddress } = useAccount();
  const [debouncedInputValue, setDebouncedInputValue] = useState("");
  const routerAddress = "0x6FE214f79b43B883C06831bD467Ff5c0c003B5f0";
  const inputValue = parseUnits(
    baseToken.inputValue.toString(),
    baseToken.decimals
  );
  const inputValueAfterFee =
    (inputValue * (FEE_DENOMINATOR - fee)) / FEE_DENOMINATOR;
  const baseTokenCA = baseToken.ca as `0x${string}`;
  const quoteTokenCA = quoteToken.ca as `0x${string}`;
  const gasLimit = 1000000;

  const contractAddress =
    quoteTokenCA && +debouncedInputValue > 0 ? routerAddress : undefined;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInputValue(baseToken.inputValue);
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [baseToken.inputValue]);

  // Fetch swap details and allowance
  const {
    data: swapData,
    error: swapError,
    isError: swapIsError,
    isLoading: isSwapLoading,
  } = useReadContracts({
    contracts: [
      {
        address: contractAddress,
        abi: routerAbi,
        functionName: "findBestPathWithGas",
        args: [inputValue, baseTokenCA, quoteTokenCA, 2, 120000],
      },
      {
        address: baseTokenCA,
        abi: tokenAbi,
        functionName: "allowance",
        args: [userAddress, routerAddress],
      },
      {
        address: contractAddress,
        abi: routerAbi,
        functionName: "findBestPathWithGas",
        args: [
          parseUnits("1", baseToken.decimals),
          baseTokenCA,
          quoteTokenCA,
          3,
          120000,
        ],
      },
    ],
  });

  const { writeContractAsync, writeContract } = useWriteContract({
    config,
  });

  // Check allowance and perform swap if necessary
  const checkAllowanceAndSwap = async (swapData: any, approval: boolean) => {
    await performSwap(swapData, approval);
  };

  // Perform swap
  const performSwap = async (swapData: any, allowanceEnough: boolean) => {
    const fee = BigInt(30); // Fee represented in 1e4 format
    const amounts = swapData.amounts;
    const adapters = swapData.adapters;
    const path = swapData.path;

    const amountOut = calculateSlippageAdjustedOutput(
      amounts[amounts.length - 1],
      10
    );

    let functionName = "";
    if (baseToken.ticker === "ETH") {
      functionName = "swapNoSplitFromNative";
    } else if (quoteToken.ticker === "ETH") {
      functionName = "swapNoSplitToNative";
    } else {
      functionName = "swapNoSplit";
    }

    let approvalResult: any;
    if (allowanceEnough) {
      const approvalRes = writeContractAsync({
        abi: tokenAbi,
        address: baseTokenCA as `0x${string}`,
        functionName: "approve",
        args: [routerAddress, maxUint256],
      });

      approvalResult = await toast.promise(approvalRes, {
        pending: {
          render() {
            return "Sending swap transaction to the blockchain, please wait...";
          },
          icon: false,
        },
        success: {
          render({ data }) {
            return `Hello ${data}`;
          },
          // icon: "🟢",
          // other options
        },
        // error: {
        //   render({data}){
        //     // When the promise reject, data will contains the error
        //     // return <MyErrorComponent message={data.message} />
        //   }
        // }
      });
    }

    const args = [[amounts[0], amountOut, path, adapters], userAddress, fee];
    console.log(amounts, amountOut, "compare to see fee out");
    console.log(args, "args for swap");
    // console.log(approvalResult, "result after approval");

    const swapRes = writeContractAsync({
      abi: routerAbi,
      address: routerAddress as `0x${string}`,
      functionName,
      args: args as any,
      value: functionName === "swapNoSplitFromNative" ? (amounts[0] as any) : 0,
      gas: BigInt(1600000),
    });

    const swapResult = await toast.promise(swapRes, {
      pending: {
        render() {
          return "I'm loading";
        },
        icon: false,
      },
      success: {
        render({ data }) {
          return `Hello ${data}`;
        },
        // other options
        // icon: "🟢",
      },
      error: {
        render({ data }) {
          return `${data.message}`;
        },
      },
    });

    console.log(swapResult, "swap result");
  };

  const foundSwapInfo = swapData?.[0].result as SwapData;
  const approval = swapData?.[1].result;

  const baseTokenForQuoteToken = swapData?.[2].result as SwapData;
  return {
    swapData: {
      ...foundSwapInfo,
      amountOut:
        foundSwapInfo && foundSwapInfo.amounts.length > 0
          ? formatUnits(
              foundSwapInfo?.amounts[foundSwapInfo.amounts.length - 1],
              quoteToken?.decimals as number
            )
          : "",
      baseForQuote:
        baseTokenForQuoteToken && baseTokenForQuoteToken.amounts.length > 0
          ? formatUnits(
              baseTokenForQuoteToken?.amounts[
                baseTokenForQuoteToken.amounts.length - 1
              ],
              quoteToken?.decimals as number
            )
          : "",
    },
    checkAllowanceAndSwap,
    approval:
      baseToken.name === "Ethereum" ? false : (approval as number) < inputValue,
  };
};

export default UseSwap;

//10000000000000000,30015168,0x4013AD1E254B92bC7cCB78fF6D60013f9f9410F2,0x4200000000000000000000000000000000000006,0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,120000
