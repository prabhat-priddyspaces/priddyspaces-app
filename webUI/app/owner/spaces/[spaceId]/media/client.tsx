"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface Space {
  public_id: string;
  space_type: string;
}

interface SpaceImage {
  public_id: string;
  image_url: string;
  is_primary: boolean;
  sort_order: number;
}

interface MediaPresignOut {
  upload_url: string;
  key: string;
  public_url: string;
}

export function SpaceMediaClient() {
  const params = useParams<{ spaceId: string }>();
  const searchParams = useSearchParams();
  const routeSpaceId = params?.spaceId || "";
  const spaceId = searchParams.get("spaceId") || (routeSpaceId === "_" ? "" : routeSpaceId);
  const locationId = useMemo(() => searchParams.get("locationId") || "", [searchParams]);

  const [space, setSpace] = useState<Space | null>(null);
  const [images, setImages] = useState<SpaceImage[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  async function load() {
    if (!spaceId) return;
    const token = getAccessToken() ?? undefined;
    const [spaceResp, imageResp] = await Promise.all([
      apiFetch<Space>(`/api/spaces/${spaceId}`, { method: "GET" }, token),
      apiFetch<SpaceImage[]>(`/api/spaces/${spaceId}/media`, { method: "GET" }, token).catch(() => []),
    ]);
    setSpace(spaceResp);
    setImages(imageResp);
    setIsPrimary(imageResp.length === 0);
    setSortOrder(String(imageResp.length));
  }

  useEffect(() => {
    load()
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load photos"))
      .finally(() => setLoading(false));
  }, [spaceId]);

  async function handleUpload() {
    if (!file) {
      setMessage("Choose an image before uploading.");
      return;
    }

    const token = getAccessToken() ?? undefined;
    setUploading(true);
    setMessage("");

    try {
      const presign = await apiFetch<MediaPresignOut>(
        "/api/media/presign",
        {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            content_type: file.type || "application/octet-stream",
            space_public_id: spaceId,
          }),
        },
        token
      );

      const uploadResp = await fetch(presign.upload_url, {
        method: "PUT",
        headers: file.type ? { "Content-Type": file.type } : undefined,
        body: file,
      });
      if (!uploadResp.ok) {
        throw new Error("Upload to storage failed");
      }

      await apiFetch(
        "/api/media",
        {
          method: "POST",
          body: JSON.stringify({
            space_public_id: spaceId,
            storage_key: presign.key,
            image_url: presign.public_url,
            is_primary: isPrimary,
            sort_order: Number(sortOrder || images.length),
          }),
        },
        token
      );

      setFile(null);
      setMessage("Photo uploaded");
      await load();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploading(false);
    }
  }

  const backHref = locationId
    ? `/owner/locations/spaces?locationId=${encodeURIComponent(locationId)}`
    : "/owner/locations/spaces";

  if (loading) {
    return (
      <AppShell>
        <div className="text-sm text-textMuted">Loading photos...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Space Photos</h2>
            <p className="text-textSecondary">
              Upload photos for {space?.space_type || "this space"} to improve the marketplace listing.
            </p>
          </div>
          <Link href={backHref}>
            <Button variant="secondary">Back To Inventory</Button>
          </Link>
        </div>

        <Card className="p-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="file">Image file</Label>
              <Input
                id="file"
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-textPrimary">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                />
                <span>Set as primary image</span>
              </label>
              <div className="space-y-2">
                <Label htmlFor="sort_order">Sort order</Label>
                <Input
                  id="sort_order"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={handleUpload} disabled={uploading}>
                {uploading ? "Uploading..." : "Upload Photo"}
              </Button>
              <Link href={backHref}>
                <Button type="button" variant="ghost">
                  Done
                </Button>
              </Link>
            </div>
            {message ? <div className="text-sm text-textMuted">{message}</div> : null}
          </div>
        </Card>

        <Card className="p-4">
          {images.length === 0 ? (
            <div className="text-sm text-textMuted">No photos uploaded yet.</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {images.map((image) => (
                <div key={image.public_id} className="rounded-md border border-border p-3">
                  <img
                    src={image.image_url}
                    alt="Space"
                    className="h-48 w-full rounded-md object-cover"
                  />
                  <div className="mt-3 text-sm text-textSecondary">
                    Sort order {image.sort_order}
                    {image.is_primary ? " • Primary" : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
