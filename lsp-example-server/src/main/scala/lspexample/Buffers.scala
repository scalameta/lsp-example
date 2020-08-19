package lspexample

import scala.collection.concurrent.TrieMap

import java.nio.file.Path

/**
 * Manages in-memory text contents of unsaved files in the editor.
 */
case class Buffers(map: TrieMap[Path, String] = TrieMap.empty) {
  def open: Iterable[Path] = map.keys
  def put(key: Path, value: String): Unit = map.put(key, value)
  def get(key: Path): Option[String] = map.get(key)
  def remove(key: Path): Unit = map.remove(key)
  def contains(key: Path): Boolean = map.contains(key)
}
