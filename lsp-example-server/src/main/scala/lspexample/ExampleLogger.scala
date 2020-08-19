package lspexample

import java.io.PrintStream
import java.nio.file.Files
import java.nio.file.StandardOpenOption

import scribe._
import scribe.format._
import scribe.modify.LogModifier
import scribe.writer.FileWriter
import java.nio.file.Path
import java.nio.file.Paths

object ExampleLogger {

  val workspaceLogPath: Path =
    Paths.get(".metals").resolve("metals.log")

  def updateDefaultFormat(): Unit = {
    Logger.root
      .clearHandlers()
      .withHandler(
        formatter = defaultFormat,
        minimumLevel = Some(scribe.Level.Info),
        modifiers = List(MetalsFilter)
      )
      .replace()
  }

  def redirectSystemOut(logfile: Path): Unit = {
    Files.createDirectories(logfile.getParent)
    val logStream = Files.newOutputStream(
      logfile,
      StandardOpenOption.APPEND,
      StandardOpenOption.CREATE
    )
    val out = new PrintStream(logStream)
    System.setOut(out)
    System.setErr(out)
    configureRootLogger(logfile)
  }

  private def configureRootLogger(logfile: Path): Unit = {
    Logger.root
      .clearModifiers()
      .clearHandlers()
      .withHandler(
        writer = newFileWriter(logfile),
        formatter = defaultFormat,
        minimumLevel = Some(Level.Info),
        modifiers = List(MetalsFilter)
      )
      .withHandler(
        writer = LanguageClientLogger,
        formatter = ExampleLogger.defaultFormat,
        minimumLevel = Some(Level.Info),
        modifiers = List(ExampleLogger.MetalsFilter)
      )
      .replace()
  }

  object MetalsFilter extends LogModifier {
    override def id = "MetalsFilter"
    override def priority: Priority = Priority.Normal
    override def apply[M](record: LogRecord[M]): Option[LogRecord[M]] = {
      if (
        record.className.startsWith(
          "org.flywaydb"
        ) && record.level < scribe.Level.Warn.value
      ) {
        None
      } else {
        Some(record)
      }
    }

  }

  def setupLspLogger(
      workspace: Path,
      redirectSystemStreams: Boolean
  ): Unit = {
    val newLogFile = workspace.resolve(workspaceLogPath)
    scribe.info(s"logging to file $newLogFile")
    if (redirectSystemStreams) {
      redirectSystemOut(newLogFile)
    }
  }

  def newBspLogger(workspace: Path): Logger = {
    val logfile = workspace.resolve(workspaceLogPath)
    Logger.root
      .orphan()
      .clearModifiers()
      .clearHandlers()
      .withHandler(
        writer = newFileWriter(logfile),
        formatter = defaultFormat,
        minimumLevel = Some(Level.Info)
      )
  }

  def newFileWriter(logfile: Path): FileWriter =
    FileWriter().path(_ => logfile).autoFlush

  def defaultFormat: Formatter = formatter"$date $levelPaddedRight $message"

  def silent: LoggerSupport =
    new LoggerSupport {
      override def log[M](record: LogRecord[M]): Unit = ()
    }
  def default: LoggerSupport = scribe.Logger.root
  def silentInTests: LoggerSupport =
    if (ExampleServerConfig.isTesting) silent
    else default
}
