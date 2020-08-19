package lspexample

import java.nio.file.Path

class Diagnostics(workspace: () => Path) {
  def didChange(path: Path): Unit = {
    ()
  }
}
