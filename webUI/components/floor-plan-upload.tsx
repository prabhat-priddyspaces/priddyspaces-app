"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getAccessToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

interface PresignResponse {
  upload_url: string;
  key: string;
}

export function FloorPlanUpload({ locationPublicId }: { locationPublicId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string>("");

  async function handlePresign() {
    if (!file) {
      setMessage("Select a file first");
      return;
    }

    const token = getAccessToken() ?? undefined;
    const presign = await apiFetch<PresignResponse>(
      "/api/floor-plans/presign",
      {
        method: "POST",
        body: JSON.stringify({ filename: file.name })
      },
      token
    );

    await fetch(presign.upload_url, {
      method: "PUT",
      body: file
    });

    await apiFetch(
      "/api/floor-plans",
      {
        method: "POST",
        body: JSON.stringify({
          location_public_id: locationPublicId,
          image_url: presign.key
        })
      },
      token
    );

    setMessage("Floor plan uploaded");
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="file"
        accept="image/png,image/jpeg"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <Button variant="secondary" onClick={handlePresign}>
        Upload via S3
      </Button>
      {message ? <div className="text-xs text-textMuted">{message}</div> : null}
    </div>
  );
}
