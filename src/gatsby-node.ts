import path from 'path'
import fs from 'fs'
import FlexSearch from 'flexsearch-ts'
import {
  GatsbyNode,
  CreatePagesArgs,
  CreateSchemaCustomizationArgs,
} from 'gatsby'
import { pick } from 'lodash'
import { pascalCase } from 'pascal-case'

import {
  IndexableDocument,
  NodeType,
  PluginOptions,
  LocalSearchNodeInput,
  Store,
} from './types'

const DEFAULT_REF = 'id'

const msg = (input: string) => `gatsby-plugin-local-search - ${input}`

const createIndexExport = (
  documents: IndexableDocument[],
  pluginOptions: PluginOptions,
): Promise<string> => {
  // console.log('createFlexSearchIndexExport')
  // console.log('documents', documents)
  // console.log('pluginOptions', pluginOptions)

  const { index: indexFields, engineOptions } = pluginOptions

  const index = new FlexSearch.Index(engineOptions)

  documents.forEach((doc, idxDoc) => {
    const docForIdx = indexFields ? pick(doc, indexFields) : doc

    const values = Object.keys(docForIdx).reduce((acc, key) => {
      acc.push(docForIdx[key])
      return acc
    }, [] as any[])

    // Using "as number" due to FlexSearch's types, but it could technically be
    // a string as well.

    console.log('values!!', values)

    // console.log('id', doc[ref])
    // console.log('o', serializedDoc)
    index.add(idxDoc, JSON.stringify(values))
  })

  return new Promise((res) => {
    const result = {
      reg: '',
      cfg: '',
      map: '',
      ctx: '',
    }

    index.export((key, data) => {
      switch (key) {
        case 'reg': {
          result['reg'] = data
          break
        }
        case 'cfg': {
          result['cfg'] = data
          break
        }
        case 'map': {
          result['map'] = data
          break
        }
        case 'ctx': {
          result['ctx'] = data
          res(JSON.stringify(result))
          break
        }

        default:
          break
      }
    })
  })
}

// Callback style is necessary since createPages cannot be async or return a
// Promise. At least, that's what GatsbyNode['createNodes'] says.
export const createPages = async (
  gatsbyContext: CreatePagesArgs,
  pluginOptions: PluginOptions,
): Promise<void> => {
  const {
    actions,
    graphql,
    reporter,
    createNodeId,
    createContentDigest,
  } = gatsbyContext
  const { createNode } = actions
  const {
    name,
    ref = DEFAULT_REF,
    store: storeFields,
    query,
    normalizer,
  } = pluginOptions

  const result = await graphql(query)

  if (result.errors) {
    reporter.error(
      msg(
        'The provided GraphQL query contains errors. The index will not be created.',
      ),
      result.errors[0],
    )
    return
  }

  const documents = (await Promise.resolve(normalizer(result))) || []

  if (documents.length < 1)
    reporter.warn(
      msg(
        `The query for index "${name}" returned no nodes. The index and store will be empty.`,
      ),
    )

  const filteredDocuments = documents.filter(
    (doc) => doc[ref] !== undefined && doc[ref] !== null,
  )

  const index = await createIndexExport(filteredDocuments, pluginOptions)

  const store = filteredDocuments.reduce((acc, doc) => {
    acc.push(storeFields ? pick(doc, storeFields) : doc)

    return acc
  }, [] as Store)

  const nodeType = pascalCase(`${NodeType.LocalSearch} ${name}`)
  const nodeId = createNodeId(name)

  const node: LocalSearchNodeInput = {
    id: nodeId,
    name,
    index,
    store,
    internal: {
      type: nodeType,
      contentDigest: createContentDigest({ index, store }),
    },
  }

  createNode(node)
}

export const createSchemaCustomization: NonNullable<
  GatsbyNode['createSchemaCustomization']
> = async (
  gatsbyContext: CreateSchemaCustomizationArgs,
  pluginOptions: PluginOptions,
) => {
  const { actions, schema, reporter, pathPrefix } = gatsbyContext
  const { createTypes } = actions
  const { name } = pluginOptions

  const nodeType = pascalCase(`${NodeType.LocalSearch} ${name}`)

  createTypes([
    schema.buildObjectType({
      name: nodeType,
      fields: {
        name: {
          type: 'String!',
          description: 'The name of the index.',
        },
        index: {
          type: 'String!',
          description: 'The search index created using the selected engine.',
        },
        store: {
          type: 'JSON!',
          description:
            'A JSON object used to map search results to their data.',
        },
        publicIndexURL: {
          type: 'String!',
          description:
            "Save the index to the site's static directory and return a public URL to it.",
          resolve: (node: LocalSearchNodeInput) => {
            const filename = `${node.internal.contentDigest}.index.txt`

            const publicPath = path.join(
              process.cwd(),
              'public',
              'static',
              filename,
            )

            if (!fs.existsSync(publicPath))
              fs.writeFile(publicPath, node.index, (err) => {
                if (err)
                  reporter.error(
                    msg(
                      `Could not save the index for "${name}" to ${publicPath}`,
                    ),
                  )
              })

            return `${pathPrefix}/static/${filename}`
          },
        },
        publicStoreURL: {
          type: 'String!',
          description:
            "Save the store to the site's static directory and return a public URL to it.",
          resolve: (node: LocalSearchNodeInput) => {
            const filename = `${node.internal.contentDigest}.store.json`

            const publicPath = path.join(
              process.cwd(),
              'public',
              'static',
              filename,
            )

            if (!fs.existsSync(publicPath))
              fs.writeFile(publicPath, JSON.stringify(node.store), (err) => {
                if (err)
                  reporter.error(
                    msg(
                      `Could not save the store for "${name}" to ${publicPath}`,
                    ),
                  )
              })

            return `${pathPrefix}/static/${filename}`
          },
        },
      },
      interfaces: ['Node'],
    }),
  ])
}
