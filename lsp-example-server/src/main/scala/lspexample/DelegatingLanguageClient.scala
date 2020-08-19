package lspexample

class DelegatingLanguageClient(var underlying: ExampleLanguageClient)
    extends ExampleLanguageClient {}
