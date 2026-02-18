//import TreeSitter core parser and the Java grammar
const Parser = require("tree-sitter");
const Java = require("tree-sitter-java");

//create and configure the TreeSitter parser for Java
const parser = new Parser();
parser.setLanguage(Java);

//sample Java source used to validate parsing.
//this can later be replaced with real file contents.
const sourceCode = `
public class HelloWorld {
  public static void main(String[] args) {
    System.out.println("Hello, world!");
  }
}
`;

//parse the Java source into a TreeSitter syntax tree
const tree = parser.parse(sourceCode);

//log the raw TreeSitter representation for debugging/verification
console.log(tree.rootNode.toString());

//recursively traverses a TreeSitter AST node and converts it into a plain JSON structure.
//this output can be used later for detailed AST visualization.

function traverse(node) {
  return {
    type: node.type,
    startPosition: node.startPosition,
    endPosition: node.endPosition,
    children: node.children.map(traverse)
  };
}

//generate a full JSON representation of the AST
const jsonTree = traverse(tree.rootNode);

//log the full AST JSON for inspection
console.log(JSON.stringify(jsonTree, null, 2));

//summarizes an AST into a lightweight metadata object
function summarizeAST(rootNode, fileName) {
  let classes = 0;
  let functions = 0;

//walk the AST and count relevant node types
  function walk(node) {
    if (node.type === "class_declaration"){
        classes++;
    }

    if (node.type === "method_declaration"){
        functions++;
    }
    node.children.forEach(walk);
  }

  walk(rootNode);

  return {
    name: fileName,
    //treeSitter rows are zero-based, so add 1 for LOC
    lines: rootNode.endPosition.row + 1,
    functions,
    classes
  };
}

//produce a summary for the parsed Java file
const summary = summarizeAST(tree.rootNode, "HelloWorld.java");

//message payload matching the current webview contract.
//this mirrors the AST_DATA message shape used by the VS Code extension’s webview for frontend rendering.
const message = {
  type: "AST_DATA",
  payload: {
    files: [summary]
  }
};

//log the final payload to verify schema alignment
console.log(JSON.stringify(message, null, 2));