import { UploadTest } from "./upload-test";

export const metadata = { title: "Upload round-trip" };

export default function UploadTestPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Upload round-trip</h1>
        <p className="text-sm text-muted-foreground">
          Temporary dev page. Pick an image: it goes through MediaProvider.upload, gets an assets row
          and an audit entry, and comes back with its pHash, EXIF, a w_400 + blur derivative, and
          signed/tampered URLs checked live below.
        </p>
      </div>
      <UploadTest />
    </div>
  );
}
