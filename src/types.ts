import { PluginOptions as GatsbyPluginOptions, NodeInput, Node } from 'gatsby'
import { IndexOptions } from 'flexsearch-ts'

export interface PartialContext {
  nodeModel: {
    getNodeById: (input: { id: string; type?: string }) => Node
  }
}

export type IndexableDocument = Record<string, unknown>

export type Store = Record<string, unknown>[]

export enum NodeType {
  LocalSearch = 'LocalSearch',
}

export interface LocalSearchNodeInput extends NodeInput {
  name: string
  index: string
  store: Store
}

interface NormalizerInput {
  errors?: unknown
  data?: unknown
}

export interface PluginOptions extends GatsbyPluginOptions {
  name: string
  engineOptions?: IndexOptions<string, false>
  ref?: string
  index?: string[]
  store?: string[]
  query: string
  normalizer: (input: NormalizerInput) => IndexableDocument[]
}
