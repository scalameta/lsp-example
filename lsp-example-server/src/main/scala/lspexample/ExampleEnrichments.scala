package lspexample

import java.net.URI
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.CompletableFuture

import scala.collection.convert.DecorateAsJava
import scala.collection.convert.DecorateAsScala
import scala.compat.java8.FutureConverters
import scala.concurrent.Future

import org.eclipse.{lsp4j => l}

object ExampleEnrichments extends DecorateAsJava with DecorateAsScala {
  implicit class XtensionLspUri(uri: String) {
    def toPath: Path = Paths.get(URI.create(uri))
  }
  implicit class XtensionRangePosition(pos: Position) {
    def toLsp: l.Range =
      new l.Range(
        new l.Position(pos.startLine, pos.startColumn),
        new l.Position(pos.endLine, pos.endColumn)
      )
  }
  implicit class XtensionScalaFuture[A](future: Future[A]) {
    def asJava: CompletableFuture[A] =
      FutureConverters.toJava(future).toCompletableFuture
  }
}
