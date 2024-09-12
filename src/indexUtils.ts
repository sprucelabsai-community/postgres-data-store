import { Index, normalizeIndex } from '@sprucelabs/data-stores'
import { quote } from './QueryBuilder'

export function generateKeyExpression(field: string) {
    let result: string | undefined
    if (field.includes('.')) {
        const parts = field.split('.')
        result = `(${parts[0]}->>'${parts[1]}')`
    } else {
        result = quote(field)
    }
    return result
}

export function generateKeyExpressions(fields: string[]) {
    return fields.map((f) => generateKeyExpression(f)).join(', ')
}

export function generateIndexName(collection: string, index: Index) {
    return `${collection}_${normalizeIndex(index).fields.join(
        '_'
    )}${'_index'}`.replace(/\./g, '_')
}
