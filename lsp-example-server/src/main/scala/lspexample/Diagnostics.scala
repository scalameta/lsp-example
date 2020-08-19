package lspexample

import java.nio.file.Path
import java.util.regex.Pattern

import scala.collection.mutable

import lspexample.ExampleEnrichments._

import org.eclipse.lsp4j.Diagnostic
import org.eclipse.lsp4j.DiagnosticSeverity
import org.eclipse.lsp4j.PublishDiagnosticsParams

class Diagnostics(
    workspace: () => Path,
    client: ExampleLanguageClient,
    buffers: Buffers
) {
  def didChange(path: Path): Unit = {
    client.publishDiagnostics(Diagnostics.lint(buffers.read(path)))
  }
}

object Diagnostics {
  val obviously: Pattern = Pattern.compile("\\bobviously\\b", Pattern.MULTILINE)
  def lint(input: Input): PublishDiagnosticsParams = {
    val buf = mutable.ListBuffer.empty[Diagnostic]
    val m = obviously.matcher(input.text)
    while (m.find()) {
      val pos = Position.range(input, m.start, m.end)
      buf += new Diagnostic(
        pos.toLsp,
        "Drop 'obviously', it rarely helps the reader understand the text",
        DiagnosticSeverity.Error,
        "example"
      )
    }
    new PublishDiagnosticsParams(input.filename, buf.asJava)
  }
}
