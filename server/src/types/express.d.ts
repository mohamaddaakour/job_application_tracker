// This code is doing TypeScript type augmentation for Express.

// The main purpose is to tell TypeScript: “Express's Request object
// normally doesn't have a user property, but in my application I am
// going to add one.”

// makes this file a module.
// That allows the declare global block to work correctly and
// lets you add declarations to the global scope from this module.
export {};

declare global {
    namespace Express {
        interface Request{
            user? : {
                id: string;
                email: string;
            };

            // Set by the validate() middleware. Read it through validated(),
            // which casts it back to the schema's output type.
            validated?: unknown;
        }
    }
}