package lspexample

import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path

import scala.collection.concurrent.TrieMap

/**
 * Manages in-memory text contents of unsaved files in the editor.
 */
case class Buffers(map: TrieMap[Path, String] = TrieMap.empty) {
  def open: Iterable[Path] = map.keys
  def put(key: Path, value: String): Unit = map.put(key, value)
  def get(key: Path): Option[String] = map.get(key)
  def remove(key: Path): Unit = map.remove(key)
  def contains(key: Path): Boolean = map.contains(key)
  def read(path: Path): Input = {
    val text = map.getOrElse(
      path,
      new String(Files.readAllBytes(path), StandardCharsets.UTF_8)
    )
    Input.filename(path.toUri().toString(), text)
  }
}
