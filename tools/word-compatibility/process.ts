/** Bounded, shell-free external oracle invocation. Logs are retained by the caller. */
export async function command(argv: readonly string[], timeoutMs = 60_000): Promise<{ code: number; output: string }> {
  try {
    const process = Bun.spawn([...argv], { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; process.kill(); }, timeoutMs);
    try {
      const [code, stdout, stderr] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()]);
      return { code: timedOut ? 124 : code, output: `${stdout}${stderr}${timedOut ? '\nOracle timed out.\n' : ''}` };
    } finally { clearTimeout(timer); }
  } catch (error) {
    return { code: 127, output: error instanceof Error ? error.message : String(error) };
  }
}
