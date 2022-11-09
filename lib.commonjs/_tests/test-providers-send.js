"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const index_js_1 = require("../index.js");
const create_provider_js_1 = require("./create-provider.js");
function stall(duration) {
    return new Promise((resolve) => { setTimeout(resolve, duration); });
}
describe("Sends Transactions", function () {
    const cleanup = [];
    after(function () {
        for (const func of cleanup) {
            func();
        }
    });
    const wallet = new index_js_1.Wallet((process.env.FAUCET_PRIVATEKEY));
    const networkName = "goerli";
    for (const providerName of create_provider_js_1.providerNames) {
        const provider = (0, create_provider_js_1.getProvider)(providerName, networkName);
        if (provider == null) {
            continue;
        }
        // Shutdown socket-based provider, otherwise its socket will prevent
        // this process from exiting
        if (provider.destroy) {
            cleanup.push(() => { provider.destroy(); });
        }
        it(`tests sending: ${providerName}`, async function () {
            this.timeout(60000);
            const w = wallet.connect(provider);
            const dustAddr = index_js_1.Wallet.createRandom().address;
            // Retry if another CI instance used our value
            let tx = null;
            for (let i = 0; i < 10; i++) {
                try {
                    tx = await w.sendTransaction({
                        to: dustAddr,
                        value: 42,
                        type: 2
                    });
                    break;
                }
                catch (error) {
                    if ((0, index_js_1.isError)(error, "REPLACEMENT_UNDERPRICED")) {
                        await stall(1000);
                        continue;
                    }
                    throw error;
                }
            }
            assert_1.default.ok(!!tx, "too many retries");
            //const receipt = 
            await provider.waitForTransaction(tx.hash); //tx.wait();
            //console.log(receipt);
            const balance = await provider.getBalance(dustAddr);
            assert_1.default.equal(balance, BigInt(42), "target balance after send");
        });
    }
});
//# sourceMappingURL=test-providers-send.js.map