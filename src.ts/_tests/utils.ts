
import fs from "fs"
import path from "path";
import zlib from 'zlib';

// Find the package root (based on the nyc output/ folder)
const root = (function() {
    let root = process.cwd();

    while (true) {
        if (fs.existsSync(path.join(root, "output"))) { return root; }
        const parent = path.join(root, "..");
        if (parent === root) { break; }
        root = parent;
    }

    throw new Error("could not find root");
})();

// Load the tests
export function loadTests<T>(tag: string): Array<T> {
   const filename = path.resolve(root, "testcases", tag + ".json.gz");
   return JSON.parse(zlib.gunzipSync(fs.readFileSync(filename)).toString());
}

export function log(context: any, text: string): void {
    if (context && context.test && typeof(context.test._ethersLog) === "function") {
        context.test._ethersLog(text);
    } else {
        console.log(text);
    }
}
