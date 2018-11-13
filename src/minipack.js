/**
 * webpack打包原理
 * 1、ES6 转换为 ES5
 * 2、处理模块加载依赖
 * 3、生成一个可以在浏览器加载执行的JS文件
 */
const fs = require('fs');
const path = require('path');
// Babylon 是 Babel 中使用的 JavaScript 解析器，用于生成AST
const babylon = require('babylon');
// 协助开发者遍历AST抽象语法树，获取节点上的信息和属性
const traverse = require('babel-traverse').default;
// 通过transformFromAst方法将AST重新生成源码
const {transformFromAst} = require('babel-core');

// 全局自增ID，记录每一个载入的模块的ID
let ID = 0;

// 模拟简版webpack-loader
function loader(filename, code) {
    if (/entry/.test(filename)) {
        console.log('this is loader');
    }
    return code;
}

/**
 * 根据传入文件提取依赖关系并返回
 * @param {String} filename 文件名
 */
function createAsset(filename) {
    const content = fs.readFileSync(filename, 'utf-8');
    // 转换源代码，变成抽象语法树（AST）
    const ast = babylon.parse(content, {
        sourceType: 'module'
    });
    // 提取依赖
    const dependencies = [];
    traverse(ast, {
        ImportDeclaration: ({node}) => {
            dependencies.push(node.source.value);
        }
    });
    // 完成依赖提取后，将AST转换为CommonJS的代码
    const id = ID++;
    const {code} = transformFromAst(ast, null, {
        presets: ['env']
    });
    const customCode = loader(filename, code);

    return {
        id,
        filename,
        dependencies,
        code,
    }
}

/**
 * 根据入口文件生成完整的依赖视图
 * @param {String} entry 入口文件
 */
function createGraph(entry) {
    // 从entry出发收集依赖，放入数组
    const mainAsset = createAsset(entry);
    const queue = [mainAsset];
    // for of 为了实现queue增加的过程中，可以一直遍历到最后
    for (const asset of queue) {
        asset.mapping = {};
        const dirname = path.dirname(asset.filename);
        asset.dependencies.forEach(relativePath => {
            const absolutePath = path.join(dirname, relativePath);
            const child = createAsset(absolutePath);
            asset.mapping[relativePath] = child.id;
            queue.push(child);
        });
    }

    return queue;
}

/**
 * 根据依赖视图打包bundle
 * @param {Array} graph 完整的文件依赖视图
 */
function bundle(graph) {
    let modules = '';
    graph.forEach(mod => {
        modules += `${mod.id}: [
            function(require, module, exports) {
                ${mod.code}
            },
            ${JSON.stringify(mod.mapping)},
        ],`;
    });

    const result = `
        (function(modules) {
            function require(id) {
            const [fn, mapping] = modules[id];
    
            function localRequire(name) {
                return require(mapping[name]);
            }
    
            const module = { exports : {} };
    
            fn(localRequire, module, module.exports);
    
            return module.exports;
            }
    
            require(0);
        })({${modules}})
        `;

    return result;
}

const graph = createGraph('./example/entry.js');
const result = bundle(graph);

console.log(result);
