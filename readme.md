# Example language server written in Scala

This repository contains a minimal implementation of a language server that's
written in Scala and reports diagnstics (compile errors) on instances of the
word "obviously" in plaintext files.

This repo consists of two major components:

- `lsp-example-server`: the server that's written in Scala and implements the
  logic behind publishing diagnostics
- `lsp-example-vscode`: the client that's written in TypeScript and configures
  the VS Code editor to launch the example language server.

## Installation

The commands below assume you have the following installed:

- `sbt`: to build the server
- `yarn`: to build the client extension
- `code`: to launch VS Code

## Getting started

Run `sbt vscode` to launch VS Code with the server installed.

While iterating on changes in the server, it's normal to run `sbt test` and
`sbt compile` beore you manually test the changes in VS Code.

To manually test the changes in VS Code, run `sbt publishLocal` and then execute
the "Reload window" command in VS Code.
