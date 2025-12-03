
import * as Koa from 'koa';

declare module 'koa' {
    interface Request {
        files?: any;
        body?: any;
    }
}

declare module 'koa-body' {
    import { Middleware } from 'koa';
    interface Options {
        multipart?: boolean;
        formidable?: any;
        strict?: boolean;
        // Add other options as needed
        jsonLimit?: string;
        formLimit?: string;
        textLimit?: string;
        encoding?: string;
        parsedMethods?: string[];
    }
    function koaBody(opts?: Options): Middleware;
    export default koaBody;
}
