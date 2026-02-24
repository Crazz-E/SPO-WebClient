declare module '7zip-min' {
  interface ListItem {
    name: string;
    size: string;
    compressed: string;
    date: string;
    time: string;
    attr: string;
    crc: string;
    encrypted: string;
    method: string;
    block: string;
  }

  interface ConfigSettings {
    binaryPath: string | undefined;
  }

  function getConfig(): ConfigSettings;
  function config(cfg: Partial<ConfigSettings>): void;

  function unpack(archivePath: string, destPath: string): Promise<string>;
  function unpack(archivePath: string, destPath: string, cb: (err: Error | null, output?: string) => void): void;
  function unpack(archivePath: string, cb: (err: Error | null, output?: string) => void): void;

  function pack(srcPath: string, destPath: string): Promise<string>;
  function pack(srcPath: string, destPath: string, cb: (err: Error | null, output?: string) => void): void;

  function list(srcPath: string): Promise<ListItem[]>;
  function list(srcPath: string, cb: (err: Error | null, output?: ListItem[]) => void): void;

  function cmd(args: string[]): Promise<string>;
  function cmd(args: string[], cb: (err: Error | null, output?: string) => void): void;
}
