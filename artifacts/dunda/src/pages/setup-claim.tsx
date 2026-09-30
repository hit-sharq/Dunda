import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetSetupStatus, useClaimOwnership } from "@workspace/api-client-react";
import { Button, Field, inputClass } from "../components/ui";
import { describeActionError } from "../lib/errors";

/**
 * Claiming ownership of a new installation.
 *
 * The first owner cannot be invited, because inviting needs an owner to already
 * exist. An owner runs a setup token out of band, and redeems it here. Signing
 * in on its own never grants anything.
 */
export function SetupClaim() {
  const status = useGetSetupStatus();
  const claim = useClaimOwnership();
  const qc = useQueryClient();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (status.isLoading) {
    return (
      <div className="surface mx-auto max-w-md rounded-2xl p-6 text-center text-sm text-[#68736d]">
        Checking setup state…
      </div>
    );
  }

  if (status.data && !status.data.claimable) {
    // Somebody already owns this organization. Nothing to do here.
    return null;
  }

  return (
    <div className="surface mx-auto max-w-md rounded-2xl p-6" data-testid="panel-setup-claim">
      <h1 className="font-display text-2xl font-bold">Claim this workspace</h1>
      <p className="mt-2 text-sm leading-6 text-[#68736d]">
        No one has claimed this organization yet. Enter the setup token to become
        its owner. The token is single-use and expires.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          claim.mutate(
            { data: { token: token.trim() } },
            {
              onSuccess: () => {
                void qc.invalidateQueries();
                setToken("");
              },
              onError: (err: unknown) => setError(describeActionError(err)),
            },
          );
        }}
        className="mt-5 grid gap-4"
      >
        <Field label="Setup token">
          <input
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className={`${inputClass} font-mono`}
            placeholder="Paste the token from pnpm db:setup-token"
            data-testid="input-setup-token"
          />
        </Field>
        {error && (
          <p className="rounded-lg border border-[#e6bdb2] bg-[#fbeae5] px-3 py-2 text-xs text-[#a3452e]" data-testid="setup-error">
            {error}
          </p>
        )}
        <Button className="w-full" disabled={claim.isPending} data-testid="button-claim-ownership">
          {claim.isPending ? "Claiming…" : "Claim ownership"}
        </Button>
        <p className="text-[11px] leading-5 text-[#8a948d]">
          The token is shown once when it is issued, and only a digest is stored. If you
          lose it, run <code className="font-mono">pnpm db:setup-token</code> again to
          issue a new one.
        </p>
      </form>
    </div>
  );
}
