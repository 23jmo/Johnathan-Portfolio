import type { ComponentType } from "react";
import {
  Row,
  Column,
  Card,
  List,
  Divider,
  Text,
  A2UIImage,
  Icon,
  Button,
  type A2UIComponentProps,
} from "./components/primitives";
import { Video, Citation, LinkCard } from "./components/rich";

/**
 * Maps A2UI component-type strings to React implementations. The agent is told
 * exactly these names in the system prompt's cheat-sheet. Anything not listed
 * here is treated as unknown and degrades gracefully (see treeBuilder).
 */
export const registry: Record<string, ComponentType<A2UIComponentProps>> = {
  Text,
  Image: A2UIImage,
  Icon,
  Button,
  Row,
  Column,
  Card,
  List,
  Divider,
  Video,
  YouTube: Video,
  Citation,
  LinkCard,
};
