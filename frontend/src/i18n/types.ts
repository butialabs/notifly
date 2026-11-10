import type { ptBR } from "./locales/pt-BR";

/** Same shape as pt-BR, with every leaf as `string`. */
type Widen<T> = { -readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

export type Messages = Widen<typeof ptBR>;

/** A node with `other` is a plural: keys point to it, not to `one`/`other`. */
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : T[K] extends { other: string } ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type MessageKey = Paths<Messages>;

export type Lang = "pt-BR" | "en";

export type Vars = Record<string, string | number>;
