import fs from "fs";
import * as t from "@babel/types";
import * as parser from "@babel/parser";

import { LifeCircleHookMap } from "./data";

// import * as traverse from "@babel/traverse";
// import * as generate from "@babel/generator";
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;

export function component_transform(code: string) {
    const ast = parser.parse(code, {
        sourceType: "module",
        plugins: [
            "typescript",
            ["decorators", { decoratorsBeforeExport: true }],
            "classProperties",
            "classPrivateProperties",
        ],
    });

    const output: any = { props: [] };
    const Props = new Set();

    const transProps = (node: any) => {
        // console.log(node.properties);
        if (!Array.isArray(node.properties)) return;
        for (const prop of node.properties) {
            const { key } = prop;
            console.log("props", key.name, prop.type);

            let type, _default;
            const inits = prop.value.properties; // type default
            if (!Array.isArray(inits)) continue;
            for (const p of inits) {
                if (p.key.name == "type") type = p.value.name.toLowerCase();
                else {
                    if (p.type == "Literal") _default = p.value?.value;
                }
            }
            !Props.has(key.name) &&
                output.props.push([key.name, type, _default]);
            Props.add(key.name);
        }
        // codeGen(t.program(getters), "tmp.js");
    };

    const Refs = new Set();
    const collectRefs = (node: any) => {
        try {
            const states = node.body.body[0].argument.properties;
            for (const state of states) {
                Refs.add(state.key.name);
            }
        } catch {}
        try {
            for (const p of node?.properties) {
                Refs.add(p.key.name);
            }
        } catch {}
    };

    const transStates = (node: any) => {
        const states = node.body.body[0].argument.properties;
        const refs = [];
        for (const state of states) {
            const { key, value } = state;
            if (t.isSpreadElement(state)) continue;
            console.log("state", key.name, state.type);

            const ref = t.variableDeclaration("let", [
                t.variableDeclarator(
                    key,
                    t.callExpression(t.identifier("$ref"), [value])
                ),
            ]);
            refs.push(ref);
        }
        // codeGen(t.program(refs), "tmp.js");
        output.states = generate(t.program(refs)).code || "";
    };
    const replaceRef = (node: any) => {
        return node;
        traverse(
            node,
            {
                enter: function (path: any) {
                    const { node } = path;
                    if (
                        !t.isIdentifier(node) ||
                        !Refs.has(node.name) ||
                        t.isProperty(path.parent) ||
                        t.isMemberExpression(path.parent)
                    )
                        return;
                    const member = t.memberExpression(
                        t.identifier(node.name),
                        t.identifier("value")
                    );
                    path.replaceWith(member), path.skip();
                },
            },
            ast
        );
        return node;
    };

    const transGetters = (node: any) => {
        const getters = [];
        for (const p of node.properties) {
            const { key, params, body } = p;
            if (t.isSpreadElement(p)) continue;
            console.log("computed", key.name, p.type);

            const getter = t.variableDeclaration("const", [
                t.variableDeclarator(
                    key,
                    t.CallExpression(t.identifier("$computed"), [
                        t.ArrowFunctionExpression(
                            params || [],
                            replaceRef(body)
                        ),
                    ])
                ),
            ]);
            getters.push(getter);
        }
        // codeGen(t.program(getters), "tmp.js");
        output.getters = generate(t.program(getters)).code || "";
    };

    const transMethods = (node: any) => {
        const methods = [];
        for (const p of node.properties) {
            const { key, params, body } = p;
            if (t.isSpreadElement(p) || !body) continue;
            console.log("method", key.name, p.type);
            const method = t.variableDeclaration("const", [
                t.variableDeclarator(
                    key,
                    t.ArrowFunctionExpression(
                        params || [],
                        replaceRef(body),
                        p.async
                    )
                ),
            ]);
            methods.push(method);
        }
        // codeGen(t.program(methods), "tmp.js");
        output.methods = generate(t.program(methods)).code || "";
    };

    const resolveWatcherArgs = (p: any) => {
        const { key, params, body } = p;
        const args = [
            Refs.has(key.name) ? key : t.arrowFunctionExpression([], key),
        ];

        let arg2, arg3;
        if (t.isObjectMethod(p))
            arg2 = t.arrowFunctionExpression(
                params || [],
                replaceRef(body),
                p.async || false
            );
        if (t.isObjectProperty(p)) {
            const arg3s = [];
            if (t.isLiteral(p.value))
                arg2 = t.arrowFunctionExpression([], p.value);
            if (t.isObjectExpression(p.value))
                for (const _p of p.value?.properties) {
                    const { params, body } = _p;
                    // console.log(_p);
                    if (t.isObjectProperty(_p)) arg3s.push(_p);
                    if (t.isObjectMethod(_p))
                        arg2 = t.arrowFunctionExpression(
                            params || [],
                            replaceRef(body),
                            _p.async
                        );
                }
            arg3s.length && (arg3 = t.objectExpression(arg3s));
        }
        // console.log(arg3);
        arg2 && args.push(arg2);
        arg3 && args.push(arg3);
        // console.log(arg2, arg3);
        return args;
    };

    const transWatcher = (node: any) => {
        const watchers = [];
        for (const p of node.properties) {
            const { key, params, body } = p;
            if (t.isSpreadElement(p)) continue;
            console.log("watcher", key.name, p.type);

            // console.log(params);
            const args = resolveWatcherArgs(p);
            const watcher = t.expressionStatement(
                t.callExpression(t.identifier("watch"), args)
            );
            watchers.push(watcher);
        }
        // codeGen(t.program(watchers), "tmp.js");
        output.watchers = generate(t.program(watchers)).code || "";
    };
    const transCreated = (node: any) => {
        const { key, body } = node;
        console.log("created", key.name, node.type);
        if (!body?.body?.length) return;
        // codeGen(t.program(replaceRef(body).body), "tmp.js");
        output[key.name] =
            generate(t.program(replaceRef(body).body)).code || "";
    };

    const transHook = (node: any) => {
        const { key, params, body } = node;
        console.log("hook", key.name, node.type);
        const arg = t.arrowFunctionExpression(
            params || [],
            replaceRef(body),
            node.async
        );
        const hook = t.expressionStatement(
            t.callExpression(t.identifier(LifeCircleHookMap[key.name]), [arg])
        );
        output[key.name] = generate(hook).code || "";
        // codeGen(hook, "tmp.js");
    };

    // collect
    traverse(ast, {
        Property: function (path: any) {
            const { node } = path;
            if (node.key.name === "computed") collectRefs(node.value);
        },
        Method: function (path: any) {
            const { node } = path;
            if (node.key.name === "data") collectRefs(node);
        },
    });

    const PropertyMap: any = {
        props: transProps,
        computed: transGetters,
        methods: transMethods,
        watch: transWatcher,
    };

    const MethodsMap: any = {
        data: transStates,
        created: transCreated,
        beforeCreate: transCreated,
    };

    const LifeHooks = Object.keys(LifeCircleHookMap);

    output.imports = [];
    traverse(ast, {
        ImportDeclaration: function (path: any) {
            const { node } = path;
            const lib = node.source.value;
            if (!lib2remove(lib)) output.imports.push(node);
        },
        Property: function (path: any) {
            const { node } = path;
            PropertyMap[node.key.name] &&
                PropertyMap[node.key.name](node.value);
        },
        Method: function (path: any) {
            const { node } = path;
            const { key } = node;
            if (MethodsMap[key.name]) MethodsMap[key.name](node);
            else {
                LifeHooks.includes(key.name) && transHook(node);
            }
        },
    });
    // console.log(Refs);
    output.imports = generate(t.program(output.imports)).code || "";
    output.hooks = "";
    Object.keys(LifeCircleHookMap).forEach((hook) => {
        output.hooks += output[hook] ? output[hook] + "\n" : "";
    });
    return { output };
}

function lib2remove(s: any) {
    const ignores = ["vuex", "vue"];
    return /^(@|\.|\/)/.test(s) || ignores.includes(s);
}

function codeGen(ast: any, filename: string) {
    const output = generate(ast);
    fs.writeFileSync(`${filename}`, output.code);
}
