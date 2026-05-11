export type CategoryData = {
  cat1List: string[]
  getCat2List: (c1: string) => string[]
  getCat3List: (c1: string, c2: string) => string[]
}
