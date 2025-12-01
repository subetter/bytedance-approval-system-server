declare module 'koa-bodyparser' {
    import { Middleware } from 'koa';
    interface Options {
        enableTypes?: ('json' | 'form' | 'text')[];
        extendTypes?: { json?: string[]; form?: string[]; text?: string[] };
        jsonLimit?: string | number;
        formLimit?: string | number;
        textLimit?: string | number;
    }
    function bodyParser(opts?: Options): Middleware;
    export default bodyParser;
}
