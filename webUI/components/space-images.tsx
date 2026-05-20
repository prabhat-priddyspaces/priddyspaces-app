"use client";

import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface SpaceImage {
  public_id: string;
  image_url: string;
  storage_key: string;
  is_primary: boolean;
  sort_order: number;
}

interface PresignResponse {
  upload_url: string;
  key: string;
  public_url: string;
  max_bytes: number;
}

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

export function SpaceImages({ spacePublicId }: { spacePublicId: string }) {
  const [images, setImages] = useState<SpaceImage[]>([]);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [primary, setPrimary] = useState(false);

  async function loadImages() {
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<SpaceImage[]>(
      `/api/spaces/${spacePublicId}/media`,
      { method: "GET" },
      token
    );
    setImages(list);
  }

  useEffect(() => {
    loadImages().catch((err) => setMessage(err?.message || "Failed to load images"));
  }, [spacePublicId]);

  async function handleUpload(file: File | null) {
    if (!file) return;
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setMessage("Image must be 10 MB or smaller");
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      const token = getAccessToken() ?? undefined;
      const presign = await apiFetch<PresignResponse>(
        "/api/media/presign",
        {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            content_type: file.type,
            size_bytes: file.size,
            space_public_id: spacePublicId
          })
        },
        token
      );
      const putRes = await fetch(presign.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file
      });
      if (!putRes.ok) {
        throw new Error("Upload failed");
      }
      await apiFetch(
        "/api/media",
        {
          method: "POST",
          body: JSON.stringify({
            space_public_id: spacePublicId,
            storage_key: presign.key,
            image_url: presign.public_url,
            is_primary: primary,
            sort_order: images.length
          })
        },
        token
      );
      setPrimary(false);
      setMessage("Image uploaded");
      await loadImages();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-4">
      {message ? <div className="text-xs text-textMuted">{message}</div> : null}
      <Card className="space-y-3 p-4">
        <div className="text-sm font-medium text-textPrimary">Upload image</div>
        <label className="flex items-center gap-2 text-sm text-textSecondary">
          <input
            type="checkbox"
            checked={primary}
            onChange={(e) => setPrimary(e.target.checked)}
            className="rounded border-border"
          />
          Mark as primary
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => handleUpload(e.target.files?.[0] || null)}
          disabled={uploading}
          className="text-sm text-textSecondary"
        />
        <Button variant="secondary" disabled>
          Upload uses auto-start on file select
        </Button>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {images.length === 0 ? (
          <div className="text-sm text-textMuted">No images yet.</div>
        ) : (
          images.map((img) => (
            <Card key={img.public_id} className="overflow-hidden">
              <img src={img.image_url} alt="Space" className="h-40 w-full object-cover" />
              <div className="p-3 text-xs text-textMuted">
                {img.is_primary ? "Primary image" : "Gallery image"}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
