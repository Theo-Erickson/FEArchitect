// Turns a child process's raw output chunks into whole lines, keeping a capped
// history so a page that connects late can replay what it missed.

// Strip ANSI colour/cursor codes so tool output reads cleanly in the browser.
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

export interface LogLine { stream: "out" | "err" | "sys"; text: string }

export class RunLog {
  lines: LogLine[] = [];
  private partial: Record<"out" | "err", string> = { out: "", err: "" };
  private cap: number;
  constructor(cap = 1000) { this.cap = cap; }

  /** Add a chunk; returns the complete lines it finished. */
  push(stream: "out" | "err", chunk: string): LogLine[] {
    const text = (this.partial[stream] + chunk).replace(ANSI, "").replace(/\r\n/g, "\n");
    const parts = text.split("\n");
    this.partial[stream] = parts.pop() ?? "";
    // A bare \r (progress bars) rewrites the line: keep only what follows the last one.
    const done = parts.map((p) => ({ stream, text: p.slice(p.lastIndexOf("\r") + 1) }));
    this.add(done);
    return done;
  }

  /** Flush any unterminated trailing output (call on exit). */
  flush(): LogLine[] {
    const done: LogLine[] = [];
    for (const s of ["out", "err"] as const) {
      if (this.partial[s]) done.push({ stream: s, text: this.partial[s] });
      this.partial[s] = "";
    }
    this.add(done);
    return done;
  }

  sys(text: string): LogLine {
    const line: LogLine = { stream: "sys", text };
    this.add([line]);
    return line;
  }

  private add(ls: LogLine[]): void {
    this.lines.push(...ls);
    if (this.lines.length > this.cap) this.lines.splice(0, this.lines.length - this.cap);
  }
}
