export interface ManifestData {
  version: string;
  permissions: string[];
  commands: { [key: string]: any };
  [key: string]: any;
}
