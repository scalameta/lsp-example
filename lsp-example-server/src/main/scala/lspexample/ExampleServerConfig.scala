package lspexample

case class ExampleServerConfig()
object ExampleServerConfig {
  val default: ExampleServerConfig = ExampleServerConfig()
  def isTesting: Boolean = "true" == System.getProperty("example.testing")
}
