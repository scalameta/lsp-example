import java.nio.file.Paths
inThisBuild(
  List(
    scalaVersion := "2.12.12",
    organization := "org.scalameta",
    version := "0.1.0-SNAPSHOT",
    scalafixDependencies += "com.github.liancheng" %% "organize-imports" % "0.4.0",
    scalafixCaching := true,
    semanticdbEnabled := true,
    semanticdbVersion := scalafixSemanticdb.revision,
    scalacOptions ++= List(
      "-Ywarn-unused:imports",
      "-Yrangepos"
    )
  )
)

lazy val server = project
  .in(file("lsp-example-server"))
  .settings(
    moduleName := "lsp-example",
    libraryDependencies ++= List(
      "dev.dirs" % "directories" % "20",
      "org.eclipse.lsp4j" % "org.eclipse.lsp4j" % "0.9.0",
      "org.scala-lang.modules" %% "scala-java8-compat" % "0.9.1",
      "com.outr" %% "scribe" % "2.7.12",
      // for debugging purposes, not strictly needed but nice for productivity
      "com.lihaoyi" %% "pprint" % "0.5.9",
      "org.scalameta" %% "munit" % "0.7.10" % Test
    ),
    testFrameworks := List(new TestFramework("munit.Framework")),
    buildInfoPackage := "lspexample",
    buildInfoKeys := Seq[BuildInfoKey](
      "exampleVersion" -> version.value
    )
  )
  .enablePlugins(BuildInfoPlugin)

commands += Command.command("vscode") { s =>
  "server/publishLocal" ::
    "vscodeLaunch" ::
    s
}

commands += Command.command("vscodeLaunch") { s =>
  import scala.sys.process._
  def exec(command: String*): Unit = {
    println("$ " + command.mkString(" "))
    val cwd = Paths.get("lsp-example-vscode").toFile
    val exit = Process(command.toList, cwd = Some(cwd)).!
    require(exit == 0, s"command failed: $command")
  }
  exec("yarn", "build")
  exec("code", "--install-extension", "lsp-example-0.1.0.vsix")
  exec("code", "--new-window", "testing-workspace")
  exec("code", "--reuse-window", "testing-workspace/hello.example")
  s
}
