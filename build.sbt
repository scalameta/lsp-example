inThisBuild(
  List(
    scalaVersion := "2.12.12",
    organization := "org.scalameta",
    version := "0.1.0-SNAPSHOT"
  )
)

lazy val server = project
  .in(file("lsp-example-server"))
  .settings(
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
