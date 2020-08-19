package lspexample

import java.util.concurrent.CompletableFuture

import org.eclipse.lsp4j.MessageActionItem
import org.eclipse.lsp4j.MessageParams
import org.eclipse.lsp4j.PublishDiagnosticsParams
import org.eclipse.lsp4j.ShowMessageRequestParams

class DelegatingLanguageClient(var underlying: ExampleLanguageClient)
    extends ExampleLanguageClient {
  override def telemetryEvent(x: Any): Unit = underlying.telemetryEvent(x)
  override def publishDiagnostics(x: PublishDiagnosticsParams): Unit =
    underlying.publishDiagnostics(x)
  override def showMessage(x: MessageParams): Unit = underlying.showMessage(x)
  override def showMessageRequest(
      x: ShowMessageRequestParams
  ): CompletableFuture[MessageActionItem] = underlying.showMessageRequest(x)
  override def logMessage(x: MessageParams): Unit = underlying.logMessage(x)
}
