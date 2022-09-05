import { defineProperties } from "../../utils/properties.js";
import { isError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

import { Typed } from "../typed.js";
import { Coder, Result, WordSize, Writer } from "./abstract-coder.js";
import { AnonymousCoder } from "./anonymous.js";

import type { Reader } from "./abstract-coder.js";


export function pack(writer: Writer, coders: ReadonlyArray<Coder>, values: Array<any> | { [ name: string ]: any }): number {
    let arrayValues: Array<any> = [ ];

    if (Array.isArray(values)) {
       arrayValues = values;

    } else if (values && typeof(values) === "object") {
        let unique: { [ name: string ]: boolean } = { };

        arrayValues = coders.map((coder) => {
            const name = coder.localName;
            if (!name) {
                logger.throwError("cannot encode object for signature with missing names", "INVALID_ARGUMENT", {
                    argument: "values",
                    info: { coder },
                    value: values
                });
            }

            if (unique[name]) {
                logger.throwError("cannot encode object for signature with duplicate names", "INVALID_ARGUMENT", {
                    argument: "values",
                    info: { coder },
                    value: values
                });
            }

            unique[name] = true;

            return values[name];
        });

    } else {
        logger.throwArgumentError("invalid tuple value", "tuple", values);
    }

    if (coders.length !== arrayValues.length) {
        logger.throwArgumentError("types/value length mismatch", "tuple", values);
    }

    let staticWriter = new Writer();
    let dynamicWriter = new Writer();

    let updateFuncs: Array<(baseOffset: number) => void> = [];
    coders.forEach((coder, index) => {
        let value = arrayValues[index];

        if (coder.dynamic) {
            // Get current dynamic offset (for the future pointer)
            let dynamicOffset = dynamicWriter.length;

            // Encode the dynamic value into the dynamicWriter
            coder.encode(dynamicWriter, value);

            // Prepare to populate the correct offset once we are done
            let updateFunc = staticWriter.writeUpdatableValue();
            updateFuncs.push((baseOffset: number) => {
                updateFunc(baseOffset + dynamicOffset);
            });

        } else {
            coder.encode(staticWriter, value);
        }
    });

    // Backfill all the dynamic offsets, now that we know the static length
    updateFuncs.forEach((func) => { func(staticWriter.length); });

    let length = writer.appendWriter(staticWriter);
    length += writer.appendWriter(dynamicWriter);
    return length;
}

export function unpack(reader: Reader, coders: ReadonlyArray<Coder>): Result {
    let values: Array<any> = [];
    let keys: Array<null | string> = [ ];

    // A reader anchored to this base
    let baseReader = reader.subReader(0);

    coders.forEach((coder) => {
        let value: any = null;

        if (coder.dynamic) {
            let offset = reader.readIndex();
            let offsetReader = baseReader.subReader(offset);
            try {
                value = coder.decode(offsetReader);
            } catch (error: any) {
                // Cannot recover from this
                if (isError(error, "BUFFER_OVERRUN")) {
                    throw error;
                }

                value = error;
                value.baseType = coder.name;
                value.name = coder.localName;
                value.type = coder.type;
            }

        } else {
            try {
                value = coder.decode(reader);
            } catch (error: any) {
                // Cannot recover from this
                if (isError(error, "BUFFER_OVERRUN")) {
                    throw error;
                }

                value = error;
                value.baseType = coder.name;
                value.name = coder.localName;
                value.type = coder.type;
            }
        }

        if (value == undefined) {
            throw new Error("investigate");
        }

        values.push(value);
        keys.push(coder.localName || null);
    });

    return Result.fromItems(values, keys);
}


export class ArrayCoder extends Coder {
    readonly coder!: Coder;
    readonly length!: number;

    constructor(coder: Coder, length: number, localName: string) {
        const type = (coder.type + "[" + (length >= 0 ? length: "") + "]");
        const dynamic = (length === -1 || coder.dynamic);
        super("array", type, localName, dynamic);
        defineProperties<ArrayCoder>(this, { coder, length });
    }

    defaultValue(): Array<any> {
        // Verifies the child coder is valid (even if the array is dynamic or 0-length)
        const defaultChild = this.coder.defaultValue();

        const result: Array<any> = [];
        for (let i = 0; i < this.length; i++) {
            result.push(defaultChild);
        }
        return result;
    }

    encode(writer: Writer, _value: Array<any> | Typed): number {
        const value = Typed.dereference(_value, "array");

        if (!Array.isArray(value)) {
            this._throwError("expected array value", value);
        }

        let count = this.length;

        if (count === -1) {
            count = value.length;
            writer.writeValue(value.length);
        }

        logger.assertArgumentCount(value.length, count, "coder array" + (this.localName? (" "+ this.localName): ""));

        let coders = [];
        for (let i = 0; i < value.length; i++) { coders.push(this.coder); }

        return pack(writer, coders, value);
    }

    decode(reader: Reader): any {
        let count = this.length;
        if (count === -1) {
            count = reader.readIndex();

            // Check that there is *roughly* enough data to ensure
            // stray random data is not being read as a length. Each
            // slot requires at least 32 bytes for their value (or 32
            // bytes as a link to the data). This could use a much
            // tighter bound, but we are erroring on the side of safety.
            if (count * WordSize > reader.dataLength) {
                logger.throwError("insufficient data length", "BUFFER_OVERRUN", {
                    buffer: reader.bytes,
                    offset: count * WordSize,
                    length: reader.dataLength
                });
            }
        }
        let coders = [];
        for (let i = 0; i < count; i++) { coders.push(new AnonymousCoder(this.coder)); }

        return unpack(reader, coders);
    }
}

