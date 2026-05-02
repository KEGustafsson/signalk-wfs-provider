import { describe, it, expect } from 'vitest'
import { buildConfigSchema, configSchema } from '../../src/schema/config.js'

describe('buildConfigSchema', () => {
  it('static configSchema has plain typeName text input', () => {
    const layerItem = configSchema.properties.providers.items.properties.layers.items as Record<string, unknown>
    const typeName = (layerItem.properties as Record<string, unknown>).typeName as Record<string, unknown>
    expect(typeName.type).toBe('string')
    expect(typeName.enum).toBeUndefined()
    expect(layerItem.allOf).toBeUndefined()
  })

  it('with known layers typeName becomes an enum dropdown', () => {
    const schema = buildConfigSchema([
      { name: 'avoin:TerritorialSeaArea_A', title: 'Territorial Sea Area' },
    ])
    const layerItem = schema.properties.providers.items.properties.layers.items as Record<string, unknown>
    const typeName = (layerItem.properties as Record<string, unknown>).typeName as Record<string, unknown>
    expect(typeName.enum).toEqual(['avoin:TerritorialSeaArea_A'])
  })

  it('with known layers allOf conditionals set label default', () => {
    const schema = buildConfigSchema([
      { name: 'avoin:TerritorialSeaArea_A', title: 'Territorial Sea Area' },
      { name: 'avoin:navigational_warnings_a', title: 'Navigational Warnings' },
    ])
    const layerItem = schema.properties.providers.items.properties.layers.items as Record<string, unknown>
    const allOf = layerItem.allOf as Array<Record<string, unknown>>
    expect(allOf).toHaveLength(2)

    const first = allOf[0] as { if: Record<string, unknown>; then: Record<string, unknown> }
    expect((first.if.properties as Record<string, unknown>)).toMatchObject({
      typeName: { const: 'avoin:TerritorialSeaArea_A' },
    })
    const thenProps = (first.then.properties as Record<string, unknown>)
    expect((thenProps.label as Record<string, unknown>).default).toBe('Territorial Sea Area')
  })

  it('with no known layers allOf is absent', () => {
    const schema = buildConfigSchema([])
    const layerItem = schema.properties.providers.items.properties.layers.items as Record<string, unknown>
    expect(layerItem.allOf).toBeUndefined()
  })
})
