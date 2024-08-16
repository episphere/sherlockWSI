const IS_PRIVATE = true

const tileServerPathSuffix = "iiif"

const sherlockWSI = {}
sherlockWSI.imageStoreBasePath = "https://storage.googleapis.com/sherlock_wsi"
sherlockWSI.pathToData = ""
sherlockWSI.imageMappingsFilename = "imageMappings.json"
sherlockWSI.tileServerBasePath = `${window.location.origin}/${tileServerPathSuffix}`

sherlockWSI.default = {
  "tileSourceOptions": {
    "profile": [ "http://iiif.io/api/image/2/level2.json" ],
    "protocol": "http://iiif.io/api/image",
    "tiles": [{
      "scaleFactors": [1, 4, 16, 64, 256, 1024],
      "width": 256,
    }]
  },
  "osdViewerOptions": {
    id: "openseadragon",
    visibilityRatio: 1,
    minZoomImageRatio: 1,
    prefixUrl: "https://episphere.github.io/svs/openseadragon/images/",
    showNavigator: false,
    // navigatorId: "osdNavigator",
    // navigatorDisplayRegionColor: "#ff4343",
    // // imageLoaderLimit: 15,
    // immediateRender: false,
    // timeout: 180*1000,
    crossOriginPolicy: "Anonymous",
    // homeButton: "home",
    // zoomInButton: "zoomIn",
    sequenceMode: false,
    // showSequenceControl: false
  },
  "navigatorOptions": {
      sizeRatio:         0.2,
      maintainSizeRatio: false,
      displayRegionColor: "#00ff00",
      crossOriginPolicy: "Anonymous"
  }
}

sherlockWSI.handlers = {
  viewer: {
    animationFinish: ({eventSource: viewer}) => {
      const center = viewer.viewport.getCenter()
      const zoom = utils.roundToPrecision(viewer.viewport.getZoom(), 3)
  
      if (center.x !== parseFloat(hashParams.wsiCenterX) || center.y !== parseFloat(hashParams.wsiCenterY) || zoom !== parseFloat(hashParams.wsiZoom)) {
        sherlockWSI.modifyHashString({
          'wsiCenterX': center.x,
          'wsiCenterY': center.y,
          'wsiZoom': zoom
        }, true)
      }
    },
    
    open: async ({eventSource: viewer}) => {
      const navigatorElement = document.getElementById("osdNavigator")
      const aspectRatio = viewer.world.getItemAt(0).source.aspectRatio

      if (aspectRatio > 1) {
        navigatorElement.style.setProperty("width", "100%")
        navigatorElement.style.setProperty("height", `${ Math.min(navigatorElement.getBoundingClientRect().width / aspectRatio, navigatorElement.parentElement.getBoundingClientRect().width * 0.7 )}px`)
      } else {
        navigatorElement.style.setProperty("height", "100%")
        navigatorElement.style.setProperty("width", `${ Math.min(navigatorElement.getBoundingClientRect().height * aspectRatio, navigatorElement.parentElement.getBoundingClientRect().height * 0.7) }px`)
      }
      
      viewer.navigator = new OpenSeadragon.Navigator({ ...sherlockWSI.default.navigatorOptions, 'element': navigatorElement, 'viewer': viewer })
      viewer.navigator.element.parentElement.style.setProperty("display", "flex")
      viewer.navigator.innerTracker.scrollHandler = (e) => {
        const zoomValueAfterAction = viewer.viewport.getZoom(true) * (1 + (e.scroll*0.5))
        if (zoomValueAfterAction >= viewer.viewport.getHomeZoom() && zoomValueAfterAction <= viewer.viewport.getMaxZoom()) {
          viewer.viewport.zoomTo(zoomValueAfterAction)
        }
      }
      viewer.navigator.innerTracker.dblClickHandler = async (e) => {
        viewer.viewport.zoomTo(viewer.viewport.getMaxZoom()*0.95)
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
      console.log(viewer.world.getItemAt(0).getHandler())
      const imageSelector = document.getElementById("imageSelect")
      const selectedImageId = imageSelector.options[imageSelector.selectedIndex].dataset.slideId

      await sherlockWSI.populateHeatmapImageSelector(selectedImageId, true, true)

      setTimeout(() => { // Try a bunch of things to resolve OSD not fully loading due to tile errors.
        const isImageLoaded = viewer.world.getItemAt(0).getFullyLoaded()
        if (!isImageLoaded) {
          sherlockWSI.handleViewerOptionsInHash()
          setTimeout (() => {
            const isImageLoaded = viewer.world.getItemAt(0).getFullyLoaded()
            if (!isImageLoaded) {
              const zoom = viewer.viewport.getZoom()
              viewer.viewport.zoomTo(zoom+0.1)
              setTimeout(()=> viewer.viewport.zoomTo(zoom), 1000)
              setTimeout(() => { // If all else fails, just run the fully-loaded handler 🥲
                const isImageLoaded = viewer.world.getItemAt(0).getFullyLoaded()
                if (!isImageLoaded) {
                  sherlockWSI.handlers.tiledImage.fullyLoadedChange()
                }
              }, 1500)
            }
          }, 500)
        }
      }, 7*1000)
    },
    updateViewport: (e) => {
      // console.log(e)
      
    },
    // DELETE LATER
    tileLoadFailed: (e) => {
      console.log(e)
    }
  },
  
  tiledImage: {
    fullyLoadedChange: async (_) => {
      if (sherlockWSI.viewer.navigator.world.getItemCount() > 0) {
        sherlockWSI.viewer.navigator.world.removeItem(sherlockWSI.viewer.navigator.world.getItemAt(0))
      }
      sherlockWSI.viewer.navigator.setVisible(true)
      sherlockWSI.progressBar(false)
      sherlockWSI.handleViewerOptionsInHash()
    }
  }

}

const utils = {
  roundToPrecision: (value, precision) => Math.round((parseFloat(value) + Number.EPSILON) * 10**precision) / 10**precision
}

var hashParams = {}

const loadHashParams = async () => {
  // Load hash parameters from the URL.
  const previousHashParams = JSON.parse(JSON.stringify(hashParams))
  hashParams = {}

  if (window.location.hash.includes("=")) {
    
    window.location.hash.slice(1).split('&').forEach( (param) => {
      let [key, value] = param.split('=')
      value = value.replace(/['"]+/g, "") // for when the hash parameter contains quotes.
      value = decodeURIComponent(value)
      hashParams[key] = value
    })
  
  }
  
  if (hashParams["fileName"] && previousHashParams?.fileName !== hashParams["fileName"]) {
    sherlockWSI.loadImage(hashParams["fileName"])
  } else if ((hashParams.wsiCenterX && hashParams.wsiCenterY && hashParams.wsiZoom) || hashParams.classPrediction) {
    sherlockWSI.handleViewerOptionsInHash(hashParams.wsiCenterX, hashParams.wsiCenterY, hashParams.wsiZoom)
  }

  window.localStorage.hashParams = JSON.stringify(hashParams)
}

sherlockWSI.modifyHashString = (hashObj, removeFromHistory=true) => {
  // hashObj contains hash keys with corresponding values to update..
  let hash = decodeURIComponent(window.location.hash)
  
  Object.entries(hashObj).forEach(([key, val]) => {
    if (val && val !== hashParams[key]) {
    
      if (hashParams[key]) {
        hash = hash.replace(`${key}=${hashParams[key]}`, `${key}=${val}`)
      } 
      else {
        hash += hash.length > 0 ? "&" : ""
        hash += `${key}=${val}`
      }
  
    } 
    
    else if (!val) {
      const param = `${key}=${hashParams[key]}`
      const paramIndex = hash.indexOf(param)
      
      if (hash[paramIndex-1] === "&") {  // if hash is of the form "...&q=123...", remove preceding & as well.
        hash = hash.replace(`&${param}`, "")
      } 
      
      else if (hash[paramIndex + param.length] === "&") { // if hash is of the form "#q=123&...", remove following & as well.
        hash = hash.replace(`${param}&`, "")
      } 
      
      else { // if hash is just #q=123, remove just the param.
        hash = hash.replace(param, "")
      }
    }
  })
  
  window.location.hash = hash

  if (removeFromHistory) {
    history.replaceState({}, '', window.location.pathname + window.location.hash)
  }
}

sherlockWSI.progressBar = (show=true) => {

  if (show) {
    document.getElementById("progressBarContainer").style.opacity = 1
    
    let progressBarCurrentWidth = 0
    let moveAheadBy = 2
    
    sherlockWSI.progressBarMover = setInterval(() => {
      if (progressBarCurrentWidth > 35 && progressBarCurrentWidth < 65) {
        moveAheadBy = 0.75
      } 
      else if (progressBarCurrentWidth >= 65 && progressBarCurrentWidth < 90) {
        moveAheadBy = 0.3
      } 
      else if (progressBarCurrentWidth >= 90 && progressBarCurrentWidth < 95) {
        moveAheadBy = 0.01
      }
      else if (progressBarCurrentWidth >= 95 && progressBarCurrentWidth < 100) {
        moveAheadBy = 0
      }

      progressBarCurrentWidth += moveAheadBy
      progressBarCurrentWidth = progressBarCurrentWidth < 100 ? progressBarCurrentWidth : 100
      
      document.getElementById("progressBar").style.width = `${progressBarCurrentWidth}%`
    }, 200)
  
  } 
  else if (sherlockWSI.progressBarMover) {
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
  // Create a tile source for the image.
  let tiffTileSources = await OpenSeadragon.GeoTIFFTileSource.getAllTileSources(url, {logLatency: false, cache: false});
  // tiffTileSources.then(ts=>viewer.open(ts));

  // const imageURLForSW = `${sherlockWSI.tileServerBasePath}/${encodeURIComponent(url)}`
  // const infoURL = `${imageURLForSW}/info.json`

  // let imageInfoReq = await fetch(infoURL)
  // if (imageInfoReq.status !== 200) {
  //   //alert("An error occurred retrieving the image information. Please try again later.")
  //   console.error(`Encountered HTTP ${imageInfoReq.status} while retrieving image information.`)
    
  //   sherlockWSI.modifyHashString({
  //     'fileURL': undefined
  //   })
    
  //   sherlockWSI.progressBar(false)
    
  //   return undefined
  // }
  
  // const imageInfo = await imageInfoReq.json()
  // const { width, height } = imageInfo
  // const tileSource = {
  //   ...sherlockWSI.default.tileSourceOptions,
  //   "@context": imageInfo["@context"],
  //   "@id": imageURLForSW,
  //   width,
  //   height,
  // }

  // return tileSource
  return tiffTileSources[0]
}

sherlockWSI.loadImageFromSelector = () => document.getElementById("imageSelect").value.length > 0 ? sherlockWSI.modifyHashString({'fileName': document.getElementById("imageSelect").value }) : {}

sherlockWSI.loadHeatmapFromSelector = () => {
  const heatmapImageSelector = document.getElementById("heatmapImageSelect")
  if (heatmapImageSelector.value.length > 0) {
    sherlockWSI.modifyHashString({
      'classPrediction': heatmapImageSelector.options[heatmapImageSelector.selectedIndex].dataset.className 
    })
  } else {
    return {}
  }
}

sherlockWSI.loadImage = async (fileName=document.getElementById("imageSelect").value) => {
  
  if (sherlockWSI.imageMappings.images.findIndex((image) => image.fileName === fileName) === -1) {
    alert(`Image with filename ${fileName} not found in mappings.`)

    sherlockWSI.modifyHashString({
      'fileName': document.getElementById("imageSelect").value
    })
    return
  }
  
  sherlockWSI.progressBar(false)
  
  // Load the image.
  if (fileName !== document.getElementById("imageSelect").value) {
    document.getElementById("imageSelect").value = fileName
  }
  
  if (!sherlockWSI.progressBarMover) {
    sherlockWSI.progressBar(true)
  }

  const url = `${sherlockWSI.imageStoreBasePath}/${sherlockWSI.pathToData}/${fileName}`
  const tileSource = await sherlockWSI.createTileSource(url)
  if (!tileSource) {
    //alert("Error retrieving image information!")
    return undefined
  }
  
  if (!sherlockWSI.viewer) {
    sherlockWSI.viewer = OpenSeadragon(sherlockWSI.default.osdViewerOptions)
    sherlockWSI.viewer.addHandler('update-viewport', sherlockWSI.handlers.viewer.updateViewport)
    sherlockWSI.viewer.addHandler('animation-finish', sherlockWSI.handlers.viewer.animationFinish)
    sherlockWSI.viewer.addHandler('tile-load-failed', sherlockWSI.handlers.viewer.tileLoadFailed)
  }
  else {
    sherlockWSI.viewer.close()
    sherlockWSI.viewer.navigator.destroy()
    sherlockWSI.viewer.navigator = null
    sherlockWSI.removeViewerOptionsFromHash()
  }

  sherlockWSI.viewer.addOnceHandler('open', sherlockWSI.handlers.viewer.open)
  sherlockWSI.viewer.open(tileSource)
}

sherlockWSI.handleViewerOptionsInHash = (centerX=hashParams?.wsiCenterX, centerY=hashParams?.wsiCenterY, zoomLevel=hashParams?.wsiZoom, classPrediction=hashParams?.classPrediction) => {
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
    if (centerX && centerY && ( centerX !== currentX || centerY !== currentY )) {
      sherlockWSI.viewer.viewport.panTo(new OpenSeadragon.Point(centerX, centerY))
      viewportChangedFlag = true
    }

    if (classPrediction) {
      const predictedClass = sherlockWSI.classMappings.find(predClass => predClass.name === classPrediction)
      const predictionImage = sherlockWSI.imageMappings.images.find(img => img.fileName === hashParams.fileName)?.predictionImages.find(predImg => predImg.classId === predictedClass.id)
      const heatmapURL = `${sherlockWSI.imageStoreBasePath}/${sherlockWSI.pathToData}/${predictedClass.name}/${predictionImage.image}`
      if (sherlockWSI.viewer.navigator.world.getItemCount() === 0 || sherlockWSI.viewer.navigator.world.getItemAt(0).source.url !== heatmapURL) {
        sherlockWSI.viewer.navigator.close()
        sherlockWSI.viewer.navigator.addSimpleImage({
          'url': heatmapURL
        })
        
        const heatmapImageSelector = document.getElementById("heatmapImageSelector")
        if (heatmapImageSelector && classPrediction !== heatmapImageSelector.options[heatmapImageSelector.selectedIndex].dataset.className) {
          const valueToUpdateTo = heatmapImageSelector.querySelector(`option[data-class-name="${classPrediction}"`)?.value
          if (valueToUpdateTo) {
            heatmapImageSelector.value = valueToUpdateTo
          } else {
            sherlockWSI.modifyHashString({
              'classPrediction': heatmapImageSelector.options[heatmapImageSelector.selectedIndex].dataset.className
            })
          }
        }
      } else {
        document.addEventListener("heatmapImageSelectorLoaded", sherlockWSI.handleViewerOptionsInHash, {once: true})
      }
    }
  }
  return viewportChangedFlag
}

const showLoader = (id="imgLoaderDiv", overlayOnElement=path.tmaCanvas) => {
  const loaderDiv = document.getElementById(id)
  if (loaderDiv && overlayOnElement) {
    const {
      width,
      height
    } = overlayOnElement.getBoundingClientRect()
    loaderDiv.style.width = width
    loaderDiv.style.height = height
    loaderDiv.style.display = "inline-block";
  }
}

sherlockWSI.removeViewerOptionsFromHash = () => {
  sherlockWSI.modifyHashString({
    'wsiCenterX': undefined,
    'wsiCenterY': undefined,
    'wsiZoom': undefined,
    'classPrediction': undefined,
  }, true)
}

sherlockWSI.loadDefaultImage = async () => {
  // const defaultWSIURL = "http://127.0.0.1:8081/Slide-0023381.svs"
  const imageSelector = document.getElementById("imageSelect")
  imageSelector.value = imageSelector.firstElementChild.value
  sherlockWSI.loadImageFromSelector()
}

sherlockWSI.getClassMappings = async () => {
  const classMappings = sherlockWSI.classMappings || await (await fetch(`${sherlockWSI.imageStoreBasePath}/${sherlockWSI.pathToData}/classMappings.json`)).json()
  return classMappings
}

// sherlockWSI.getImageMappings = async () => {
//   const imageMappings = sherlockWSI.imageMappings || await (await fetch(`${sherlockWSI.imageStoreBasePath}/imageMappings.json`)).json()
//   return imageMappings
// }

sherlockWSI.populateImageSelector = async () => {
  const imageSelector = document.getElementById("imageSelect")

  sherlockWSI.imageMappings.images.forEach(img => {
    const optionElement = document.createElement("option")
    optionElement.id = `imageSelector_slideId_${img.id.replace(/ /,"_")}`
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

const heatmapImageChangeHandler = () => {
  const heatmapImageSelector = document.getElementById("heatmapImageSelector")
  const selectedClass = heatmapImageSelector.options[heatmapImageSelector.selectedIndex].dataset.className
  sherlockWSI.modifyHashString({
    'classPrediction': selectedClass
  })
}

sherlockWSI.populateHeatmapImageSelector = async (imageId, select=true, forceRefresh=true) => {
  const selectorParent = document.getElementById("navigatorAndSelectorParent")
  
  if (selectorParent.querySelector("select#heatmapImageSelector")) {
    selectorParent.removeChild(selectorParent.querySelector("select#heatmapImageSelector"))
  }
  
  if (!sherlockWSI.classMappings) {
    sherlockWSI.classMappings = await sherlockWSI.getClassMappings()
  }
  
  const { predictionImages } = sherlockWSI.imageMappings.images.find(img => img.id === imageId)

  const heatmapImageSelector = document.createElement('select')
  heatmapImageSelector.id = "heatmapImageSelector"
  heatmapImageSelector.onchange = heatmapImageChangeHandler

  predictionImages.forEach(heatmapImg => {
    const predictionClass = sherlockWSI.classMappings.find(predClass => predClass.id === heatmapImg.classId)
    if (predictionClass) {
      const optionElement = document.createElement('option')
      optionElement.value = `${predictionClass.name}/${heatmapImg.image}`
      optionElement.innerText = predictionClass.displayName
      optionElement.dataset["className"] = predictionClass.name
      heatmapImageSelector.appendChild(optionElement)
    }
  })

  selectorParent.appendChild(heatmapImageSelector)
  if (select) {
    if (hashParams.classPrediction) {
      const valueToUpdateTo = heatmapImageSelector.querySelector(`option[data-class-name="${hashParams.classPrediction}"`)?.value
      if (valueToUpdateTo) {
        heatmapImageSelector.value = valueToUpdateTo
      } else {
        sherlockWSI.modifyHashString({
          'classPrediction': heatmapImageSelector.options[heatmapImageSelector.selectedIndex].dataset.className
        })
      }
    }
    heatmapImageSelector.dispatchEvent(new Event('change'))
  }
}

const imageMapUploadHandler = () => {
  const imageMapUploadElement = document.getElementById("imageMapUpload")
  const imageMapFile = imageMapUploadElement.files[0]
  
  const reader = new FileReader()
  reader.onload = (e) => {
    sherlockWSI.imageMappings = JSON.parse(e.target.result)
    localStorage.imageMappings = JSON.stringify(sherlockWSI.imageMappings)
    loadApp()
  }
  reader.readAsText(imageMapFile)
}

const loadApp = async () => {
  document.getElementById("imageMapUploadParent").style.display = "none"
  document.getElementById("imageSelectorParent").style.display = "inline-block"
  
  sherlockWSI.pathToData = IS_PRIVATE ? sherlockWSI.imageMappings.gcsBaseFolder : ""
  
  loadHashParams()
  
  await sherlockWSI.populateImageSelector()
  if (!hashParams["fileName"]) {
    sherlockWSI.loadDefaultImage()
  }
}

window.onhashchange = loadHashParams

window.onload = async () => {
  try {
    if (IS_PRIVATE) {
      const localImageMappings = JSON.parse(localStorage.imageMappings)
      sherlockWSI.pathToData = localImageMappings.gcsBaseFolder
    }
    
    sherlockWSI.imageMappings = await (await fetch(`${sherlockWSI.imageStoreBasePath}/${sherlockWSI.pathToData}/${sherlockWSI.imageMappingsFilename}`)).json()
    loadApp()
  
  } catch (e) {
    console.log("Image Mappings not found!")
  }
}