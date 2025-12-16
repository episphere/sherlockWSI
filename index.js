const IS_PRIVATE = true

const sherlockWSI = {}
sherlockWSI.imageStoreBasePath = "https://storage.googleapis.com/sherlock_wsi"
sherlockWSI.pathToData = ""
sherlockWSI.imageMappingsFilename = "imageMappings.json"

sherlockWSI.default = {
  "osdViewerOptions": {
    id: "openseadragon",
    visibilityRatio: 1,
    minZoomImageRatio: 1,
    prefixUrl: "https://episphere.github.io/svs/openseadragon/images/",
    showNavigator: false,
    navigatorId: "osdNavigator",
    navigatorDisplayRegionColor: "#ff4343",
    crossOriginPolicy: "Anonymous",
    sequenceMode: false,
  },
  "navigatorOptions": {
    sizeRatio: 0.2,
    maintainSizeRatio: false,
    displayRegionColor: "#00ff00",
    crossOriginPolicy: "Anonymous"
  }
}

sherlockWSI.handlers = {
  viewer: {
    animationFinish: ({ eventSource: viewer }) => {
      if (viewer.world.getItemAt(0).getFullyLoaded()) {
        const center = viewer.viewport.getCenter()
        const zoom = utils.roundToPrecision(viewer.viewport.getZoom(), 3)

        if (center.x !== parseFloat(hashParams.wsiCenterX) || center.y !== parseFloat(hashParams.wsiCenterY) || zoom !== parseFloat(hashParams.wsiZoom)) {
          sherlockWSI.modifyHashString({
            'wsiCenterX': center.x,
            'wsiCenterY': center.y,
            'wsiZoom': zoom
          }, true)
        }
      }
    },

    open: async ({ eventSource: viewer }) => {
      const navigatorElement = document.getElementById("osdNavigator")
      const aspectRatio = viewer.world.getItemAt(0).source.aspectRatio

      //   if (aspectRatio > 1) {
      navigatorElement.style.setProperty("width", "100%")
      navigatorElement.style.setProperty("height", `${Math.min(navigatorElement.getBoundingClientRect().width / aspectRatio, navigatorElement.parentElement.getBoundingClientRect().width * 0.7)}px`)
      //   } else {
      //     navigatorElement.style.setProperty("height", "100%")
      //     navigatorElement.style.setProperty("width", `${ Math.min(navigatorElement.getBoundingClientRect().height * aspectRatio, navigatorElement.parentElement.getBoundingClientRect().height * 0.7) }px`)
      //   }
      viewer.navigator = new OpenSeadragon.Navigator({ ...sherlockWSI.default.navigatorOptions, 'element': navigatorElement, 'viewer': viewer })
      viewer.navigator.element.parentElement.style.setProperty("display", "flex")
      viewer.navigator.innerTracker.scrollHandler = (e) => {
        const zoomValueAfterAction = viewer.viewport.getZoom(true) * (1 + (e.scroll * 0.5))
        if (zoomValueAfterAction >= viewer.viewport.getHomeZoom() && zoomValueAfterAction <= viewer.viewport.getMaxZoom()) {
          viewer.viewport.zoomTo(zoomValueAfterAction)
        }
      }
      viewer.navigator.innerTracker.dblClickHandler = async (e) => {
        viewer.viewport.zoomTo(viewer.viewport.getMaxZoom() * 0.95)
        const fullyLoadedChangeHandlerForNavigator = (e, resolve) => {
          if (e.fullyLoaded) {
            resolve()
          } else {
            viewer.world.getItemAt(0).addOnceHandler('fully-loaded-change', (e) => fullyLoadedChangeHandlerForNavigator(e, resolve))
          }
        }
        new Promise(resolve => viewer.world.getItemAt(0).addOnceHandler('fully-loaded-change', (e) => fullyLoadedChangeHandlerForNavigator(e, resolve))).then(() => {
          e.quick = true
          viewer.navigator.innerTracker.clickHandler(e)
        })
      }

      viewer.world.getItemAt(0).addOnceHandler('fully-loaded-change', sherlockWSI.handlers.tiledImage.fullyLoadedChange)

      setTimeout(() => {
        const isImageLoaded = viewer.world.getItemAt(0).getFullyLoaded()
        if (!isImageLoaded) {
          sherlockWSI.handleViewerOptionsInHash()
          setTimeout(() => {
            const isImageLoaded = viewer.world.getItemAt(0).getFullyLoaded()
            if (!isImageLoaded) {
              const zoom = viewer.viewport.getZoom()
              viewer.viewport.zoomTo(zoom + 0.1)
              setTimeout(() => viewer.viewport.zoomTo(zoom), 1000)
              setTimeout(() => {
                const isImageLoaded = viewer.world.getItemAt(0).getFullyLoaded()
                if (!isImageLoaded) {
                  viewer.world.getItemAt(0)._setFullyLoaded(true)
                }
              }, 1500)
            }
          }, 500)
        }
      }, 7 * 1000)
    },
    fullPage: ({ eventSource: viewer, fullPage }) => {
      if (fullPage) {
        viewer.navigator.element.parentElement.style.setProperty("position", "fixed")
        viewer.navigator.element.parentElement.style.setProperty("bottom", "20px")
        viewer.navigator.element.parentElement.style.setProperty("right", "20px")
        viewer.navigator.element.parentElement.style.setProperty("z-index", "100")
      } else {
        viewer.navigator.element.parentElement.style.removeProperty("position")
        viewer.navigator.element.parentElement.style.removeProperty("bottom")
        viewer.navigator.element.parentElement.style.removeProperty("right")
        viewer.navigator.element.parentElement.style.removeProperty("z-index")
      }
    },
    updateViewport: (e) => { },
    tileLoadFailed: (e) => {
      console.log(e)
    }
  },

  tiledImage: {
    fullyLoadedChange: async (_) => {
      // if (sherlockWSI.viewer.navigator.world.getItemCount() > 0) {
      //     sherlockWSI.viewer.navigator.close()
      // }
      sherlockWSI.viewer.navigator.setVisible(true)
      sherlockWSI.progressBar(false)
      const imageSelector = document.getElementById("imageSelect")
      const selectedImageId = imageSelector.options[imageSelector.selectedIndex].dataset.slideId

      await sherlockWSI.populateHeatmapImageSelector(selectedImageId, true, true)
      sherlockWSI.heatmapImageChangeHandler()
      const { Imagebox3 } = await import("https://episphere.github.io/imagebox3/imagebox3.mjs")
      const imagebox3Instance = new Imagebox3(sherlockWSI.constructURLToWSI())
      await imagebox3Instance.init()
      const { pixelsPerMicron } = await imagebox3Instance.getInfo()
      if (pixelsPerMicron) {
        sherlockWSI.viewer.scalebar({
          type: OpenSeadragon.ScalebarType.MICROSCOPY,
          pixelsPerMeter: pixelsPerMicron * 10 ** 6,
          location: OpenSeadragon.ScalebarLocation.BOTTOM_LEFT
        })
      }
    }
  }
}

const utils = {
  roundToPrecision: (value, precision) => Math.round((parseFloat(value) + Number.EPSILON) * 10 ** precision) / 10 ** precision
}

var hashParams = {}

const loadHashParams = async () => {
  const previousHashParams = JSON.parse(JSON.stringify(hashParams))
  hashParams = {}

  if (window.location.hash.includes("=")) {
    for (const param of window.location.hash.slice(1).split('&')) {
      let [key, value] = param.split('=')
      value = value.replace(/['"]+/g, "")
      value = decodeURIComponent(value)
      hashParams[key] = value
    }
  }

  let imageMappingsChanged = false
  if (hashParams["gcsBaseFolder"] && previousHashParams?.gcsBaseFolder !== hashParams["gcsBaseFolder"]) {
    await loadImageMappings()
    imageMappingsChanged = true
  }

  if (hashParams["fileName"] && (imageMappingsChanged || previousHashParams?.fileName !== hashParams["fileName"])) {
    await sherlockWSI.loadImage(hashParams["fileName"])
  }
  if ((hashParams.wsiCenterX && hashParams.wsiCenterY && hashParams.wsiZoom) || hashParams.classPrediction || hashParams.heatmapClassId) {
    sherlockWSI.handleViewerOptionsInHash(hashParams.wsiCenterX, hashParams.wsiCenterY, hashParams.wsiZoom, hashParams.classPrediction, hashParams.heatmapClassId)
  }

  window.localStorage.hashParams = JSON.stringify(hashParams)
}

sherlockWSI.modifyHashString = (hashObj, removeFromHistory = true) => {
  let hash = decodeURIComponent(window.location.hash)

  for (const [key, val] of Object.entries(hashObj)) {
    if (val && val !== hashParams[key]) {
      if (hashParams[key]) {
        hash = hash.replace(`${key}=${hashParams[key]}`, `${key}=${val}`)
      } else {
        hash += hash.length > 0 ? "&" : ""
        hash += `${key}=${val}`
      }
    } else if (!val) {
      const param = `${key}=${hashParams[key]}`
      const paramIndex = hash.indexOf(param)

      if (hash[paramIndex - 1] === "&") {
        hash = hash.replace(`&${param}`, "")
      } else if (hash[paramIndex + param.length] === "&") {
        hash = hash.replace(`${param}&`, "")
      } else {
        hash = hash.replace(param, "")
      }
    }
  }

  window.location.hash = hash

  if (removeFromHistory) {
    history.replaceState({}, '', window.location.pathname + window.location.hash)
  }
}

sherlockWSI.progressBar = (show = true) => {
  if (show) {
    document.getElementById("progressBarContainer").style.opacity = 1

    let progressBarCurrentWidth = 0
    let moveAheadBy = 2

    sherlockWSI.progressBarMover = setInterval(() => {
      if (progressBarCurrentWidth > 35 && progressBarCurrentWidth < 65) {
        moveAheadBy = 0.75
      } else if (progressBarCurrentWidth >= 65 && progressBarCurrentWidth < 90) {
        moveAheadBy = 0.3
      } else if (progressBarCurrentWidth >= 90 && progressBarCurrentWidth < 95) {
        moveAheadBy = 0.01
      } else if (progressBarCurrentWidth >= 95 && progressBarCurrentWidth < 100) {
        moveAheadBy = 0
      }

      progressBarCurrentWidth += moveAheadBy
      progressBarCurrentWidth = progressBarCurrentWidth < 100 ? progressBarCurrentWidth : 100

      document.getElementById("progressBar").style.width = `${progressBarCurrentWidth}%`
    }, 200)
  } else if (sherlockWSI.progressBarMover) {
    clearInterval(sherlockWSI.progressBarMover)
    delete sherlockWSI.progressBarMover

    setTimeout(() => {
      setTimeout(() => {
        document.getElementById("progressBar").style.width = "0%"
      }, 700)

      document.getElementById("progressBarContainer").style.opacity = "0"
    }, 700)

    document.getElementById("progressBar").style.width = "100%"
  }
}

sherlockWSI.createTileSource = async (url) => {
  let tiffTileSources = await OpenSeadragon.GeoTIFFTileSource.getAllTileSources(url, { logLatency: false, cache: false })
  return tiffTileSources[0]
}

sherlockWSI.loadImageFromSelector = () => {
  if (document.getElementById("imageSelect").value.length > 0) {
    sherlockWSI.modifyHashString({
      'fileName': document.getElementById("imageSelect").value,
      'wsiCenterX': undefined,
      'wsiCenterY': undefined,
      'wsiZoom': undefined,
      'classPrediction': undefined,
      'heatmapClassId': undefined,
    })
  }
}

sherlockWSI.loadHeatmapFromThumbnail = (className) => {
  const predictedClass = sherlockWSI.classMappings.find(predClass => predClass.name === className)
  if (predictedClass) {
    sherlockWSI.modifyHashString({
      'classPrediction': className,
      'heatmapClassId': predictedClass.id
    })
  }
}
sherlockWSI.toggleHeatmapOverlay = () => {
  const toggle = document.getElementById('overlayHeatmapToggle')
  const opacityControl = document.getElementById('heatmapOpacityControl')
  const slider = document.getElementById('heatmapOpacitySlider')

  if (toggle.checked) {
    // Show opacity control and set slider to 0.5
    slider.removeAttribute('disabled')
    slider.value = 0.5
  } else {
    // Hide opacity control and set opacity to 0
    slider.setAttribute('disabled', 'true')
    if (sherlockWSI.viewer.world.getItemCount() > 1) {
      slider.value = 0
    }
  }
  sherlockWSI.heatmapOpacityChangeHandler()
}

sherlockWSI.heatmapOpacityChangeHandler = () => {
  const slider = document.getElementById('heatmapOpacitySlider')
  const valueDisplay = document.getElementById('opacityValue')
  valueDisplay.textContent = Math.round(slider.value * 100) + '%'

  if (sherlockWSI.viewer.world.getItemCount() > 1) {
    sherlockWSI.viewer.world.getItemAt(1).setOpacity(parseFloat(slider.value))
  }
}

sherlockWSI.constructURLToWSI = (fileName = document.getElementById("imageSelect").value) => {
  return `${sherlockWSI.imageStoreBasePath}/${sherlockWSI.pathToData}/${fileName}`
}

sherlockWSI.loadImage = async (fileName = document.getElementById("imageSelect").value) => {
  if (sherlockWSI.imageMappings.images.findIndex((image) => image.fileName === fileName) === -1) {
    alert(`Image with filename ${fileName} not found in mappings.`)
    sherlockWSI.modifyHashString({
      'fileName': document.getElementById("imageSelect").value
    })
    return
  }

  sherlockWSI.progressBar(false)

  if (fileName !== document.getElementById("imageSelect").value) {
    document.getElementById("imageSelect").value = fileName
  }

  if (!sherlockWSI.progressBarMover) {
    sherlockWSI.progressBar(true)
  }

  const url = sherlockWSI.constructURLToWSI(fileName)
  const tileSource = await sherlockWSI.createTileSource(url)
  if (!tileSource) {
    return undefined
  }

  if (!sherlockWSI.viewer) {
    sherlockWSI.viewer = OpenSeadragon(sherlockWSI.default.osdViewerOptions)
    sherlockWSI.viewer.addHandler('update-viewport', sherlockWSI.handlers.viewer.updateViewport)
    sherlockWSI.viewer.addHandler('animation-finish', sherlockWSI.handlers.viewer.animationFinish)
    sherlockWSI.viewer.addHandler('full-page', sherlockWSI.handlers.viewer.fullPage)
    sherlockWSI.viewer.addHandler('tile-load-failed', sherlockWSI.handlers.viewer.tileLoadFailed)
  } else {
    sherlockWSI.viewer.close()
    sherlockWSI.viewer.navigator.destroy()
    sherlockWSI.viewer.navigator = null
  }

  sherlockWSI.viewer.addOnceHandler('open', sherlockWSI.handlers.viewer.open)
  sherlockWSI.viewer.open(tileSource)
}

sherlockWSI.handleViewerOptionsInHash = (centerX = hashParams?.wsiCenterX, centerY = hashParams?.wsiCenterY, zoomLevel = hashParams?.wsiZoom, classPrediction = hashParams?.classPrediction, heatmapClassId = hashParams?.heatmapClassId) => {
  let viewportChangedFlag = false

  if (sherlockWSI.viewer?.viewport) {
    const currentZoom = sherlockWSI.viewer.viewport.getZoom()
    zoomLevel = parseFloat(zoomLevel)
    if (zoomLevel && zoomLevel !== currentZoom) {
      sherlockWSI.viewer.viewport.zoomTo(zoomLevel)
      viewportChangedFlag = true
    }

    const { x: currentX, y: currentY } = sherlockWSI.viewer.viewport.getCenter()
    centerX = parseFloat(centerX)
    centerY = parseFloat(centerY)
    if (centerX && centerY && (centerX !== currentX || centerY !== currentY)) {
      sherlockWSI.viewer.viewport.panTo(new OpenSeadragon.Point(centerX, centerY))
      viewportChangedFlag = true
    }

    if (sherlockWSI.viewer?.navigator && (classPrediction || heatmapClassId) && sherlockWSI.classMappings) {
      // Find the prediction class - prefer classId if available, fallback to className
      let predictedClass
      if (heatmapClassId) {
        predictedClass = sherlockWSI.classMappings.find(predClass => predClass.id === heatmapClassId)
      }
      if (!predictedClass && classPrediction) {
        predictedClass = sherlockWSI.classMappings.find(predClass => predClass.name === classPrediction)
      }

      if (predictedClass) {
        const predictionImage = sherlockWSI.imageMappings.images.find(img => img.fileName === hashParams.fileName)?.predictionImages.find(predImg => predImg.classId === predictedClass.id)

        if (predictionImage) {
          const heatmapURL = `${sherlockWSI.imageStoreBasePath}/${sherlockWSI.pathToData}/${predictedClass.name}/${predictionImage.image}`
          document.getElementById("navigatorTitle").innerHTML = `Predictions for <strong>${predictedClass.name}</strong>`
          if (sherlockWSI.viewer.navigator.world.getItemCount() === 0 || sherlockWSI.viewer.navigator.world.getItemAt(0).source.url !== heatmapURL) {
            sherlockWSI.viewer.navigator.close()
            sherlockWSI.viewer.navigator.addSimpleImage({
              'url': heatmapURL,
            })
            if (sherlockWSI.viewer.world.getItemCount() > 1) {
              sherlockWSI.viewer.world.removeItem(sherlockWSI.viewer.world.getItemAt(1))
            }
            sherlockWSI.viewer.addSimpleImage({
              'url': heatmapURL,
              'opacity': parseFloat(document.getElementById("heatmapOpacitySlider").value) >= 0 ? parseFloat(document.getElementById("heatmapOpacitySlider").value) : 0.5
            })

            // Update thumbnail selection
            document.querySelectorAll('.heatmap-thumbnail').forEach(thumb => {
              if (thumb.dataset.className === predictedClass.name) {
                thumb.classList.add('ring-4', 'ring-blue-500')
              } else {
                thumb.classList.remove('ring-4', 'ring-blue-500')
              }
            })

            // Show opacity control
            document.getElementById('heatmapOpacityControl').classList.remove('hidden')

            // Ensure hash has both parameters
            if (!hashParams.classPrediction || !hashParams.heatmapClassId) {
              sherlockWSI.modifyHashString({
                'classPrediction': predictedClass.name,
                'heatmapClassId': predictedClass.id
              }, true)
            }
          }
        }
      }
    }
  }
  return viewportChangedFlag
}

sherlockWSI.removeViewerOptionsFromHash = () => {
  sherlockWSI.modifyHashString({
    'wsiCenterX': undefined,
    'wsiCenterY': undefined,
    'wsiZoom': undefined,
    'classPrediction': undefined,
    'heatmapClassId': undefined,
  }, true)
}

sherlockWSI.loadDefaultImage = async () => {
  const imageSelector = document.getElementById("imageSelect")
  imageSelector.value = imageSelector.firstElementChild.value
  sherlockWSI.loadImageFromSelector()
}

sherlockWSI.getClassMappings = async () => {
  const classMappings = sherlockWSI.classMappings || await (await fetch(`${sherlockWSI.imageStoreBasePath}/${sherlockWSI.pathToData}/classMappings.json`)).json()
  return classMappings
}

sherlockWSI.populateImageSelector = async () => {
  const imageSelector = document.getElementById("imageSelect")

  sherlockWSI.imageMappings.images.forEach(img => {
    const optionElement = document.createElement("option")
    optionElement.id = `imageSelector_slideId_${img.id.replace(/ /, "_")}`
    optionElement.innerText = img.slideName
    optionElement.value = img.fileName
    optionElement.dataset["slideId"] = `${img.id}`
    imageSelector.appendChild(optionElement)
  })

  if (hashParams.fileName) {
    const valueToUpdateTo = imageSelector.querySelector(`option[value="${hashParams.fileName}"]`)?.value
    if (valueToUpdateTo) {
      imageSelector.value = valueToUpdateTo
    } else {
      sherlockWSI.modifyHashString({
        'fileName': imageSelector.value
      })
    }
  }
}

sherlockWSI.heatmapImageChangeHandler = () => {
  const selectedThumbnail = document.querySelector('.heatmap-thumbnail.ring-4')
  if (selectedThumbnail) {
    const selectedClass = selectedThumbnail.dataset.className
    const selectedClassId = selectedThumbnail.dataset.classId
    sherlockWSI.modifyHashString({
      'classPrediction': selectedClass,
      'heatmapClassId': selectedClassId
    })
  }
}

sherlockWSI.populateHeatmapImageSelector = async (imageId, select = true, forceRefresh = true) => {
  const container = document.getElementById("heatmapThumbnailsContainer")
  const selectorContainer = document.getElementById("heatmapSelectorContainer")

  container.innerHTML = ''

  if (!sherlockWSI.classMappings) {
    sherlockWSI.classMappings = await sherlockWSI.getClassMappings()
  }

  const { predictionImages } = sherlockWSI.imageMappings.images.find(img => img.id === imageId)

  if (!predictionImages || predictionImages.length === 0) {
    selectorContainer.classList.add('hidden')
    return
  }

  selectorContainer.classList.remove('hidden')

  let firstHeatmap = null
  let shouldAutoSelectFirst = !hashParams.heatmapClassId && !hashParams.classPrediction

  predictionImages.forEach((heatmapImg, index) => {
    const predictionClass = sherlockWSI.classMappings.find(predClass => predClass.id === heatmapImg.classId)
    if (predictionClass) {
      const heatmapURL = `${sherlockWSI.imageStoreBasePath}/${sherlockWSI.pathToData}/${predictionClass.name}/${heatmapImg.image}`

      const thumbnailDiv = document.createElement('div')
      thumbnailDiv.className = 'heatmap-thumbnail relative cursor-pointer rounded-lg overflow-hidden border-2 border-gray-300 hover:border-blue-400 transition-all duration-200 aspect-square group'
      thumbnailDiv.dataset.className = predictionClass.name
      thumbnailDiv.dataset.classId = predictionClass.id
      thumbnailDiv.onclick = () => sherlockWSI.loadHeatmapFromThumbnail(predictionClass.name)

      const img = document.createElement('img')
      img.src = heatmapURL
      img.alt = predictionClass.displayName
      img.className = 'w-full h-full object-cover'
      img.loading = 'lazy'

      const label = document.createElement('div')
      label.className = 'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-xs p-2 font-medium'
      label.textContent = predictionClass.displayName

      thumbnailDiv.appendChild(img)
      thumbnailDiv.appendChild(label)
      container.appendChild(thumbnailDiv)

      // Store first heatmap for auto-selection
      if (index === 0) {
        firstHeatmap = { name: predictionClass.name, id: predictionClass.id, url: heatmapURL }
      }

      // Set initial selection based on hash - prefer heatmapClassId, fallback to classPrediction
      const shouldSelect = (hashParams.heatmapClassId && hashParams.heatmapClassId === predictionClass.id) ||
        (!hashParams.heatmapClassId && hashParams.classPrediction === predictionClass.name)

      if (shouldSelect) {
        thumbnailDiv.classList.add('ring-4', 'ring-blue-500')

        // Load the heatmap into navigator if not already loaded
        if (sherlockWSI.viewer?.navigator) {
          setTimeout(() => {
            sherlockWSI.handleViewerOptionsInHash(
              hashParams.wsiCenterX,
              hashParams.wsiCenterY,
              hashParams.wsiZoom,
              predictionClass.name,
              predictionClass.id
            )
          }, 100)
        }
      }
    }
  })

  // Auto-select first heatmap if no hash parameters specify a selection
  if (shouldAutoSelectFirst && firstHeatmap) {
    setTimeout(() => {
      sherlockWSI.loadHeatmapFromThumbnail(firstHeatmap.name)
    }, 100)
  }
}

const imageMapUploadHandler = () => {
  const imageMapUploadElement = document.getElementById("imageMapUpload")
  const imageMapFile = imageMapUploadElement.files[0]

  const reader = new FileReader()
  reader.onload = (e) => {
    const localImageMap = JSON.parse(e.target.result)
    if (localImageMap?.gcsBaseFolder) {
      sherlockWSI.modifyHashString({
        "gcsBaseFolder": localImageMap.gcsBaseFolder
      })
    }
  }
  reader.readAsText(imageMapFile)
}

const loadImageMappings = async () => {
  try {
    if (IS_PRIVATE) {
      if (hashParams["gcsBaseFolder"]) {
        sherlockWSI.pathToData = hashParams["gcsBaseFolder"]
      }
    }
    sherlockWSI.imageMappings = await (await fetch(`${sherlockWSI.imageStoreBasePath}/${sherlockWSI.pathToData}/${sherlockWSI.imageMappingsFilename}`)).json()
    loadApp()
  } catch (e) {
    console.log("Image Mappings not found!")
  }
}

const loadApp = async () => {
  document.getElementById("imageMapUploadParent").style.display = "none"
  document.getElementById("imageSelectorParent").classList.remove("hidden")

  await sherlockWSI.populateImageSelector()
  if (!hashParams["fileName"]) {
    sherlockWSI.loadDefaultImage()
  }
}

// Update opacity display on page load
document.addEventListener('DOMContentLoaded', () => {
  const slider = document.getElementById('heatmapOpacitySlider')
  const valueDisplay = document.getElementById('opacityValue')
  if (slider && valueDisplay) {
    valueDisplay.textContent = Math.round(slider.value * 100) + '%'
  }
})

window.onhashchange = loadHashParams
window.onload = loadHashParams