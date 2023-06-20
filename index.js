const tileServerPathSuffix = "iiif"

const sherlockWSI = {}
sherlockWSI.imageServerBasePath = "https://storage.googleapis.com/sherlock_wsi"
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
    showNavigator: true,
    navigatorId: "osdNavigator",
    navigatorDisplayRegionColor: "#e7f8ff",
    imageLoaderLimit: 15,
    immediateRender: true,
    timeout: 180*1000,
    crossOriginPolicy: "Anonymous",
    homeButton: "home",
    zoomInButton: "zoomIn"
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
    
    open: ({eventSource: viewer}) => {
      viewer.world.getItemAt(0).addOnceHandler('fully-loaded-change', sherlockWSI.handlers.tiledImage.fullyLoadedChange)
      
    },
    updateViewport: (e) => {
      // console.log(e)
      
    },
    navigatorClick: (e) => {
      console.log(sherlockWSI.viewer.navigator.__lastClickedPoint, Date.now())
      if (e.quick && !e.shift) {
        if (sherlockWSI.viewer.navigator.__lastClickedPoint && sherlockWSI.viewer.navigator.__lastClickedPoint.x === e.position.x && sherlockWSI.viewer.navigator.__lastClickedPoint.y === e.position.y  && Date.now() - sherlockWSI.viewer.navigator.__lastClickedPoint.time < 500) {
          // double click
          sherlockWSI.viewer.zoomTo()
        } else {
          sherlockWSI.viewer.navigator.__lastClickedPoint = e.position
          sherlockWSI.viewer.navigator.__lastClickedPoint.time = Date.now()
        }
      }
    }
  },
  
  tiledImage: {
    fullyLoadedChange: (_) => {
      const imageSelector = document.getElementById("imageSelect")
      sherlockWSI.viewer.navigator.world.removeItem(sherlockWSI.viewer.navigator.world.getItemAt(0))
      sherlockWSI.viewer.navigator.addSimpleImage({url: imageSelector.options[imageSelector.selectedIndex].dataset["heatmapImage"]})
      sherlockWSI.viewer.navigator.setVisible(true)
      sherlockWSI.progressBar(false)
      sherlockWSI.handlePanAndZoom()
    }
  },


}

const utils = {
  roundToPrecision: (value, precision) => Math.round((parseFloat(value) + Number.EPSILON) * 10**precision) / 10**precision
}

var hashParams = {}
localStorage.hashParams = ""

const loadHashParams = async () => {
  // Load hash parameters from the URL.
  const previousHashParams = window.localStorage.hashParams ? JSON.parse(window.localStorage.hashParams) : {}
  hashParams = {}

  if (window.location.hash.includes("=")) {
    
    window.location.hash.slice(1).split('&').forEach( (param) => {
      let [key, value] = param.split('=')
      value = value.replace(/['"]+/g, "") // for when the hash parameter contains quotes.
      value = decodeURIComponent(value)
      hashParams[key] = value
    })
  
  }
  
  if (hashParams["fileURL"] && previousHashParams?.fileURL !== hashParams["fileURL"]) {
    sherlockWSI.progressBar(false)
    sherlockWSI.loadImage(hashParams["fileURL"])
  }

  if (hashParams.wsiCenterX && hashParams.wsiCenterY && hashParams.wsiZoom) {
    sherlockWSI.handlePanAndZoom(hashParams.wsiCenterX, hashParams.wsiCenterY, hashParams.wsiZoom)
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
  const imageURLForSW = `${sherlockWSI.tileServerBasePath}/${encodeURIComponent(url)}`
  const infoURL = `${imageURLForSW}/info.json`

  let imageInfoReq = await fetch(infoURL)
  if (imageInfoReq.status !== 200) {
    //alert("An error occurred retrieving the image information. Please try again later.")
    console.error(`Encountered HTTP ${imageInfoReq.status} while retrieving image information.`)
    
    sherlockWSI.modifyHashString({
      'fileURL': undefined
    })
    
    sherlockWSI.progressBar(false)
    
    return undefined
  }
  
  const imageInfo = await imageInfoReq.json()
  const { width, height } = imageInfo
  const tileSource = {
    ...sherlockWSI.default.tileSourceOptions,
    "@context": imageInfo["@context"],
    "@id": imageURLForSW,
    width,
    height,
  }

  return tileSource
}

sherlockWSI.loadImageFromSelector = () => document.getElementById("imageSelect").value.length > 0 ? sherlockWSI.modifyHashString({'fileURL': document.getElementById("imageSelect").value }) : {}

sherlockWSI.loadImage = async (url=document.getElementById("imageSelect").value) => {
  // Load the image.
  if (url !== document.getElementById("imageSelect").value) {
    document.getElementById("imageSelect").value = url
  }
  
  if (!sherlockWSI.progressBarMover) {
    sherlockWSI.progressBar(true)
  }

  const tileSource = await sherlockWSI.createTileSource(url)
  if (!tileSource) {
    //alert("Error retrieving image information!")
    return undefined
  }
  
  if (!sherlockWSI.viewer) {
    sherlockWSI.viewer = OpenSeadragon(sherlockWSI.default.osdViewerOptions)
    sherlockWSI.viewer.navigator.setVisible(false)
    sherlockWSI.viewer.addHandler('update-viewport', sherlockWSI.handlers.viewer.updateViewport)
    sherlockWSI.viewer.addHandler('animation-finish', sherlockWSI.handlers.viewer.animationFinish)
    sherlockWSI.viewer.addHandler('navigator-click', sherlockWSI.handlers.viewer.navigatorClick)
  }
  else {
    sherlockWSI.removePanAndZoomFromHash()
  }

  sherlockWSI.viewer.addOnceHandler('open', sherlockWSI.handlers.viewer.open)
  sherlockWSI.viewer.open(tileSource)
}

sherlockWSI.handlePanAndZoom = (centerX=hashParams?.wsiCenterX, centerY=hashParams?.wsiCenterY, zoomLevel=hashParams?.wsiZoom) => {
  if (sherlockWSI.viewer?.viewport) {
    const currentZoom = sherlockWSI.viewer.viewport.getZoom()
    zoomLevel = parseFloat(zoomLevel)
    if (zoomLevel && zoomLevel !== currentZoom) {
      sherlockWSI.viewer.viewport.zoomTo(zoomLevel)
    }
    
    const { x: currentX, y: currentY } = sherlockWSI.viewer.viewport.getCenter()
    centerX = parseFloat(centerX)
    centerY = parseFloat(centerY)
    if (centerX && centerY && ( centerX !== currentX || centerY !== currentY )) {
      sherlockWSI.viewer.viewport.panTo(new OpenSeadragon.Point(centerX, centerY))
    }
  }
}

sherlockWSI.removePanAndZoomFromHash = () => {
  sherlockWSI.modifyHashString({
    'wsiCenterX': undefined,
    'wsiCenterY': undefined,
    'wsiZoom': undefined
  }, true)
}

sherlockWSI.loadDefaultImage = async () => {
  // const defaultWSIURL = "http://127.0.0.1:8081/Slide-0023381.svs"
  const imageSelector = document.getElementById("imageSelect")
  imageSelector.value = imageSelector.firstElementChild.value
  sherlockWSI.loadImageFromSelector()
}

sherlockWSI.addServiceWorker = async () => {
	if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`./imagebox3.js?tileServerPathSuffix=${tileServerPathSuffix}`)
		.catch((error) => {
      console.log('Service worker registration failed', error)
      reject(error)
		})
    await navigator.serviceWorker.ready
	}
}


sherlockWSI.populateImageSelector = async () => {
  const imageSelector = document.getElementById("imageSelect")
  const imageMappings = await (await fetch(`${sherlockWSI.imageServerBasePath}/imageMappings.json`)).json()
  imageMappings.images.forEach(img => {
    const optionElement = document.createElement("option")
    optionElement.innerText = img.name
    optionElement.value = `${sherlockWSI.imageServerBasePath}/${img.name}`
    optionElement.dataset["heatmapImage"] = `${sherlockWSI.imageServerBasePath}/${img.heatmapImage}`
    imageSelector.appendChild(optionElement)
  })
}

sherlockWSI.addServiceWorker()
window.onload = async () => {
  loadHashParams()
  
  if (!hashParams["fileURL"]) {
    // setTimeout(() => , 1000)
  }
  await sherlockWSI.populateImageSelector()
  sherlockWSI.loadDefaultImage()
}

window.onhashchange = loadHashParams
