import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Il vero MapCanvas richiede WebGL: si verifica solo che MapView lo carichi (lazy) quando c'è il token.
vi.mock("./MapCanvas", () => ({
  default: (props: { token: string }) => <div data-testid="canvas-stub">{props.token}</div>,
}));

import { MapView } from "./MapView";

const props = { geometry: [[9, 45], [10, 45]] as Array<[number, number]>, stations: [], selectedId: null, onSelectStation: () => {} };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("MapView", () => {
  it("senza token Mapbox mostra un segnaposto invece della mappa (l'elenco resta utilizzabile)", () => {
    vi.stubEnv("VITE_MAPBOX_PUBLIC_TOKEN", "");
    render(<MapView {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("Mappa non disponibile");
    expect(screen.queryByTestId("canvas-stub")).not.toBeInTheDocument();
  });

  it("un token fatto di soli spazi vale come assente", () => {
    vi.stubEnv("VITE_MAPBOX_PUBLIC_TOKEN", "   ");
    render(<MapView {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("Mappa non disponibile");
  });

  it("con il token carica la mappa (lazy) passandole il token e le props", async () => {
    vi.stubEnv("VITE_MAPBOX_PUBLIC_TOKEN", "pk.test");
    render(<MapView {...props} />);
    expect(await screen.findByTestId("canvas-stub")).toHaveTextContent("pk.test");
  });
});
