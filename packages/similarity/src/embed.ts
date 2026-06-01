// Pluggable embedding boundary. The embedding model is the index identity
// (NOT hot-swappable); the default at P3 is text-embedding-3-small @ dims=1536.
// Manual UI + Gower similarity work with NO embedder configured.
export interface Embedder {
  id: string;
  dims: number;
  embed(text: string): Promise<number[]>;
}
