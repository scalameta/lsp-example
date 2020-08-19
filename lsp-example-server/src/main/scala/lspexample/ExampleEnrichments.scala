package lspexample

import scala.collection.convert.DecorateAsJava
import scala.collection.convert.DecorateAsScala
import scala.compat.java8.FutureConverters
import java.util.concurrent.CompletableFuture
import scala.concurrent.Future
import java.nio.file.Path
import java.nio.file.Paths
import java.net.URI

object ExampleEnrichments extends DecorateAsJava with DecorateAsScala {
  implicit class XtensionLspUri(uri: String) {
    def toPath: Path = Paths.get(URI.create(uri))
  }
  implicit class XtensionScalaFuture[A](future: Future[A]) {
    def asJava: CompletableFuture[A] =
      FutureConverters.toJava(future).toCompletableFuture
  }
}
