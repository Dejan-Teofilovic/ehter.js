
import assert from "assert";

import { loadTests } from "./utils.js";

import {
    getBytes, wordlists,
    HDNodeWallet, HDNodeVoidWallet, Mnemonic
} from "../index.js";

import type { Wordlist } from "../wordlists/index.js";

import type { TestCaseMnemonic, TestCaseMnemonicNode } from "./types.js";


const decoder = new TextDecoder();
function fromHex(hex: string): string {
    const data = getBytes(hex);
    return decoder.decode(data);
}

type Test = {
    phrase: string;
    password: string;
    wordlist: Wordlist;
    mnemonic: Mnemonic;
    checkMnemonic: (a: Mnemonic) => void;
    test: TestCaseMnemonic;
};

describe("Test HDWallets", function() {
    function checkWallet(wallet: HDNodeWallet | HDNodeVoidWallet, test: TestCaseMnemonicNode): void {
        assert.equal(wallet.chainCode, test.chainCode, "chainCode");
        assert.equal(wallet.depth, test.depth, "depth");
        assert.equal(wallet.index, test.index, "index");
        assert.equal(wallet.fingerprint, test.fingerprint, "fingerprint");
        assert.equal(wallet.parentFingerprint, test.parentFingerprint, "parentFingerprint");
        assert.equal(wallet.publicKey, test.publicKey, "publicKey");

        if (wallet instanceof HDNodeWallet) {
            assert.equal(wallet.extendedKey, test.xpriv, "xpriv");
            assert.equal(wallet.privateKey, test.privateKey, "privateKey");
            assert.equal(wallet.neuter().extendedKey, test.xpub, "xpub");
        } else if (wallet instanceof HDNodeVoidWallet) {
            assert.equal(wallet.extendedKey, test.xpub, "xpub");
        }
    }

    const tests = loadTests<TestCaseMnemonic>("mnemonics");

    const checks: Array<Test> = [ ];
    tests.forEach((test) => {
        // The phrase and password are stored in the test as hex so they
        // are safe as ascii7 values for viewing, printing, etc.
        const phrase = fromHex(test.phrase);
        const password = fromHex(test.password);
        const wordlist = wordlists[test.locale];
        if (wordlist == null) {
            it(`tests ${ test.name }`, function() {
                this.skip();
            });
            return;
        }

        const mnemonic = Mnemonic.fromPhrase(phrase, password, wordlist);

        function checkMnemonic(actual: Mnemonic): void {
            assert.equal(actual.phrase, phrase, "phrase");
            assert.equal(actual.password, password, "password");
            assert.equal(actual.wordlist.locale, test.locale, "locale");
            assert.equal(actual.entropy, mnemonic.entropy, "entropy");
            assert.equal(actual.computeSeed(), mnemonic.computeSeed(), "seed");
        }

        checks.push({
            phrase, password, wordlist, mnemonic, checkMnemonic, test
        });
    });

    for (const { test, checkMnemonic, phrase, password, wordlist } of checks) {
        it(`computes the HD keys by mnemonic: ${ test.name }`, function() {
            for (const subtest of test.nodes) {
                const w = HDNodeWallet.fromPhrase(phrase, password, subtest.path, wordlist);
                assert.ok(w instanceof HDNodeWallet, "instanceof HDNodeWallet");
                assert.equal(w.path, subtest.path, "path")
                checkWallet(w, subtest);
                assert.ok(!!w.mnemonic, "has mnemonic");
                checkMnemonic(w.mnemonic as Mnemonic);
            }
        });
    }

    for (const { test } of checks) {
        it(`computes the HD keys by entropy: ${ test.name }`, function() {
            const seedRoot = HDNodeWallet.fromSeed(test.seed);
            for (const subtest of test.nodes) {
                const w = seedRoot.derivePath(subtest.path);
                assert.ok(w instanceof HDNodeWallet, "instanceof HDNodeWallet");
                assert.equal(w.path, subtest.path, "path")
                checkWallet(w, subtest);
                assert.equal(w.mnemonic, null);
            }
        });
    }

    for (const { test } of checks) {
        it(`computes the HD keys by enxtended private key: ${ test.name }`, function() {
            for (const subtest of test.nodes) {
                const w = HDNodeWallet.fromExtendedKey(subtest.xpriv);
                assert.ok(w instanceof HDNodeWallet, "instanceof HDNodeWallet");
                checkWallet(w, subtest);
                assert.equal(w.mnemonic, null);
            }
        });
    }

    for (const { test, phrase, password, wordlist } of checks) {
        it(`computes the neutered HD keys by paths: ${ test.name }`, function() {
            const root = HDNodeWallet.fromPhrase(phrase, password, "m", wordlist).neuter();
            for (const subtest of test.nodes) {
                if (subtest.path.indexOf("'") >= 0) {
                    assert.throws(() => {
                        const w = root.derivePath(subtest.path);
                        console.log(w);
                    }, (error: any) => {
                        return (error.code === "UNSUPPORTED_OPERATION" &&
                            error.message.match(/^cannot derive child of neutered node/) &&
                            error.operation === "deriveChild");
                    });
                } else {
                    const w = root.derivePath(subtest.path);
                    assert.ok(w instanceof HDNodeVoidWallet, "instanceof HDNodeVoidWallet");
                    assert.equal(w.path, subtest.path, "path")
                    checkWallet(w, subtest);
                }
            }
        });
    }

    for (const { test } of checks) {
        it(`computes the neutered HD keys by enxtended public key: ${ test.name }`, function() {
            for (const subtest of test.nodes) {
                const w = HDNodeWallet.fromExtendedKey(subtest.xpub);
                assert.ok(w instanceof HDNodeVoidWallet, "instanceof HDNodeVoidWallet");
                checkWallet(w, subtest);
            }
        });
    }
});
