// Where shared homes and their preview pictures are kept: Vercel Blob with
// private access (served only through our own routes, so we choose every
// header), or a Map locally and in tests.

export type BlobStore = {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(path: string): Promise<Uint8Array | null>;
  remove(...paths: string[]): Promise<void>;
};

export function memoryBlobs(): BlobStore {
  const files = new Map<string, Uint8Array>();
  return {
    async put(path, bytes) {
      files.set(path, bytes);
    },
    async get(path) {
      return files.get(path) ?? null;
    },
    async remove(...paths) {
      for (const p of paths) files.delete(p);
    },
  };
}

/** Vercel Blob (reads BLOB_READ_WRITE_TOKEN from the environment). */
export function vercelBlobs(token: string): BlobStore {
  const sdk = () => import("@vercel/blob");
  return {
    async put(path, bytes, contentType) {
      const { put } = await sdk();
      await put(path, new Blob([bytes as BlobPart], { type: contentType }), {
        access: "private",
        token,
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
      });
    },
    async get(path) {
      const { get } = await sdk();
      const result = await get(path, { access: "private", token, useCache: false });
      if (!result || result.statusCode !== 200) return null;
      return new Uint8Array(await new Response(result.stream).arrayBuffer());
    },
    async remove(...paths) {
      const { del } = await sdk();
      if (paths.length) await del(paths, { token });
    },
  };
}
