(function (factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['jquery'], factory);
    } else {
        // Browser globals
        factory(jQuery);
    }
}(function ($) {
    // Create the defaults once
    var pluginName = "vizi",
        defaults = {
            // Which overflow container should we keep track of?
            container: window,
            // Return back visibility percentage
            // How much of the element is visible in the container?
            percentVisible: true,
            // Return back progress percentage
            // How far has the element "traveled" through the viewable area?
            percentProgress: true,
            // Should we use the real % when the element is larger than the container or default to 1?
            ignoreOverflow: false, 
            // Offsets for the element
            // Positive numbers expand the element outward, negative numbers act as an inset
            // Can be a number or an object ({ top: 0, left: 0, right: 0, bottom: 0 })
            offset: 0,
            // An all or nothing approach.
            // Element will be visible if any of it is in the container's viewable area.
            // Otherwise, it is considered to not be visible.
            partiallyVisible: true,

            // Callbacks
            // 
            // When the element is visible in the container 
            onVisible: function(data){},
            // When the element enters the visible area
            onEnter: function(data){},
            // When the element leaves the visible area
            onLeave: function(data){},
        };

    var frame = false;

    // The actual plugin constructor
    function Plugin( element, options ) {
    	base = this;
        base.element = element;

        // jQuery has an extend method that merges the
        // contents of two or more objects, storing the
        // result in the first object. The first object
        // is generally empty because we don't want to alter
        // the default options for future instances of the plugin
        base.settings = $.extend( {}, defaults, options) ;

        base._defaults = defaults;
        base._name = pluginName;

        base._init();
    }

    $.extend(Plugin.prototype, {

        /**
         * PRIVATE METHODS
         * ===============
         */
            _init: function() {
                var 
                    instance = this,
                    element = instance.element;

                // Set default data
                instance._data = {
                    container: {
                        // Results of getBoundingClientRect()
                        rect: null
                    },
                    element: {
                        // Results of getBoundingClientRect()
                        rect: null,
                        // What individual parts of the element are visisble
                        position: {
                            top: false,
                            bottom: false,
                            left: false,
                            right: false,
                            all: false,
                        },
                        // Is any part of the element visible on screen?
                        visible: false,
                        // How much of the element is visible in either axis
                        percent: {
                            x: 0,
                            y: 0
                        },
                        // Create offsets from the option in the settings
                        // Top and left are inverse because we want positive values to be expanding the object outward, and negative numbers inward.
                        // We're saving these in data so that they can be dynamically updated later.
                        offset: {
                            left: 0,
                            top: 0,
                            right: 0, 
                            bottom: 0,
                        },
                        progress: {
                            x: 0,
                            y: 0
                        }
                    }
                };

                // Set rAF
                instance._setRAF.call( instance );

                // First call
                instance._updateElementVisibility.call( instance );

                // Call during scrolling
                instance._bindEvents.call( instance );

                // Call the initial event
                instance._event.call( instance );
            },
            /**
             * Set a universal requestAnimationFrame for browsers.
             */
            _setRAF: function(){
                var windowElement = window;
                windowElement.requestAnimFrame = (function(callback) {
                return  windowElement.requestAnimationFrame || 
                        windowElement.webkitRequestAnimationFrame || 
                        windowElement.mozRequestAnimationFrame || 
                        windowElement.oRequestAnimationFrame || 
                        windowElement.msRequestAnimationFrame ||
                        // Fallback to a timeout in older browsers
                        function(callback) {
                            windowElement.setTimeout(callback, 1000 / 60);
                        };
                })();
            },
            /**
             * MDN throttle custom event.
             * @author https://developer.mozilla.org/en-US/docs/Web/Events/resize
             * 
             * @param  {String} type [Event to throttle]
             * @param  {String} name [Name of new throttled event]
             * @param  {Object} obj  [Object to listen on. Default to window.]
             */
            _throttle: function (type, name, obj) {
                obj = obj || window;
                var running = false;
                var func = function() {

                    if (running) { return; }

                    running = true;

                    requestAnimFrame(function() {
                        obj.dispatchEvent(new CustomEvent(name));
                        running = false;
                    });
                };

                obj.addEventListener(type, func);
            },
            /*
             * setContainerData
             * ---
             * Gets the bounding rectanlge for the container and saves it so we can compare later.
             * Since the window element (which would be most commonly used) doesn't have one, we can make one just like it.
             */
            _setContainerData: function(){
                var 
                    instance = this,
                    cont = $(instance.settings.container)[0],
                // Our made up window boundingClientRect
                    windowContRect = {
                        left: 0,
                        top: 0,
                        right: $(window).width(),
                        bottom: $(window).height(),
                        width: $(window).width(),
                        height: $(window).height()
                    },
                // Choose the one to use
                    contRect = ( instance.settings.container === window ) ? windowContRect : cont.getBoundingClientRect(),
                // Make up the end object of data
                    cont_data = {
                        left: contRect.left,
                        top: contRect.top,
                        right: contRect.right,
                        bottom: contRect.bottom,
                        width: contRect.width,
                        height: contRect.height
                    };

                // Set the data
                instance._data.container.rect = cont_data;
            },
            /**
             * setElementOffset
             * ---
             * Set the element offset to save it for later.
             * @param {Number|Object} args [A number or object with offsets for sides]
             */
            _setElementOffset: function( args ){
                var 
                    instance = this,
                    offset_setting = args || instance.settings.offset,
                    offset = {
                        left: 0,
                        top: 0,
                        right: 0, 
                        bottom: 0,
                    };

                // If the offset is just a number
                if ( !isNaN(offset_setting) ){
                    offset.left = offset.top = -offset_setting;
                    offset.right = offset.bottom = offset_setting;
                }
                // If the offset is an object
                else if ( Object.getPrototypeOf({}) === Object.getPrototypeOf(offset_setting) ) {
                    if ( args.left !== undefined && !isNaN(args.left) ){ offset.left = -args.left; }
                    if ( args.top !== undefined && !isNaN(args.top) ){ offset.top = -args.top; }
                    if ( args.right !== undefined && !isNaN(args.right) ){ offset.right = args.right; }
                    if ( args.bottom !== undefined && !isNaN(args.bottom) ){ offset.bottom = args.bottom; }
                }
                // Save the offset for later
                instance._data.element.offset = offset;
            },
            /**
             * setElementData
             * ---
             * Get the element client rectange data and add in the offsets to it.
             * Save the data for use later.
             */
            _setElementData: function(){
                var 
                    instance = this,
                    element = instance.element,
                // Get the element coordinates
                    elementRect = element.getBoundingClientRect(),
                // Get the offset settings
                    offset = instance._data.element.offset,
                // Make the data object
                    elem_data = {
                        left: elementRect.left + offset.left,
                        top: elementRect.top + offset.top,
                        right: elementRect.right + offset.right,
                        bottom: elementRect.bottom + offset.bottom,
                        width: elementRect.width + ( -offset.left + offset.bottom ),
                        height: elementRect.height + ( -offset.top + offset.bottom )
                    };

                // Save the data
                instance._data.element.rect = elem_data;
            },
            /**
             * setElementPosition
             * ---
             * Save the element position status.
             * We'll use this later to help us calculate percentages.
             * A position is "true" if it is visible on screen. Each is the edge of the element.
             */
            _setElementPosition: function(){
                var 
                    instance = this,
                    cont_data = instance._data.container.rect,
                    elem_data = instance._data.element.rect,
                // Get the positions based on our cacludations
                // Most of these caclulations "zero" the measurement by comparing the same position to the container.
                    position = {
                        top: ( cont_data.top - elem_data.top <= 0 && Math.abs( cont_data.top - elem_data.top ) < cont_data.height ),
                        bottom: ( cont_data.bottom - elem_data.bottom > 0 && Math.abs( cont_data.bottom - elem_data.bottom ) < cont_data.height ),
                        left: ( cont_data.left - elem_data.left <= 0 && Math.abs( cont_data.left - elem_data.left ) < cont_data.width ),
                        right: ( cont_data.right - elem_data.right > 0 && Math.abs( cont_data.right - elem_data.right ) < cont_data.width ),
                    };

                // Set the "all" parameter. 
                // Means every part of the element is in the container.
                // If any part of the element is outside of the container, it will return false.
                position.all = ( position.left && position.top && position.right && position.bottom );
                // Save the element position data
                instance._data.element.position = position;
            },
            /**
             * setElementVisibility
             * ---
             * Set the visibility of the element.
             * This will set the visibility to true if *any part* of the element is visible on screen.
             */
            _setElementVisibility: function(){
                var 
                    instance = this,
                    container_rect = instance._data.container.rect,
                    element_rect = instance._data.element.rect,
                // Element position
                // Needs to be updated before calling this function
                    position = instance._data.element.position,
                // If statement for visibility
                // The statement checks both axis seperately to see if it is "visible" on the axis.
                // If it is visible on both axis, then it is in the viewport.
                // We need to do this since it could be visible on 1 axis and not another.
                    visible = false;


                if ( instance.settings.partiallyVisible ){
                    // Partly on screen
                    if ( ( position.top || position.bottom ) && ( position.right || position.left ) ){
                        visible = true;
                    }
                    // Cut off X axis
                    else if ( ( position.top || position.bottom ) && (element_rect.left < 0 && element_rect.right >= container_rect.width) ){
                        visible = true;
                    }
                    // Cut off Y axis
                    else if ( (element_rect.top < 0 && element_rect.bottom >= container_rect.height) && ( position.right || position.left ) ){
                        visible = true;
                    }
                    // Cut off on both axis
                    else if ( !position.all && (element_rect.left < 0 && element_rect.right >= container_rect.width) && (element_rect.top < 0 && element_rect.bottom >= container_rect.height) ) {
                        visible = true;
                    }                    
                }
                else {
                    visible = position.all;
                }

                // Set the visible boolean
                instance._data.element.visible = visible;
            },
            /**
             * setElementPercent
             * ---
             * Set the percents and save them for later
             */
            _setElementPercent: function(){
                var 
                    instance = this,
                    percentY = instance._getPercentY.call( instance ),
                    percentX = instance._getPercentX.call( instance );

                // Set the percents
                instance._data.element.percent.y = percentY;
                instance._data.element.percent.x = percentX;
            },

            _setElementProgress: function(){
                var 
                    instance = this,
                    progressY = instance._getProgressY.call(this),
                    progressX = instance._getProgressX.call(this);

                // Set the percents
                instance._data.element.progress.y = progressY;
                instance._data.element.progress.x = progressX;
            },

            _getProgressY: function(){
                var
                    instance = this,
                    element = instance.element,
                    element_rect = instance._data.element.rect,
                    element_position = instance._data.element.position,
                    container_rect = instance._data.container.rect,
                    ret = 0,
                    calc = ( element_rect.bottom - container_rect.top ) / (container_rect.height + element_rect.height),
                    percent = instance._normalizePercent( calc );

                return percent;
            },

            _getProgressX: function(){
                var 
                    instance = this,
                    element = instance.element,
                    element_rect = instance._data.element.rect,
                    element_position = instance._data.element.position,
                    container_rect = instance._data.container.rect,
                    ret = 0,
                    calc = ( element_rect.right - container_rect.left ) / (container_rect.width + element_rect.width),
                    percent = instance._normalizePercent( calc );

                return percent;
            },

            /**
             * getPercentX
             * ---
             * @return {Number} [A number from 0 to 1 of the amount of the element visible]
             */
            _getPercentX: function(){
                var 
                    instance = this,
                    element = instance.element,
                    element_rect = instance._data.element.rect,
                    element_position = instance._data.element.position,
                    container_rect = instance._data.container.rect,
                    ret = 0;

                // If either the left or right is visible
                if ( element_position.left && !element_position.right || !element_position.left && element_position.right ){
                    // Left is visible, coming from right
                    if ( element_position.left ){
                        ret = (container_rect.width - (element_rect.left - container_rect.left)) / element_rect.width;
                    }
                    // Right is visible, coming from left
                    else {
                        ret = (element_rect.right - container_rect.left) / element_rect.width;
                    }
                }
                // If both are visible
                else if ( element_position.left && element_position.right ){
                    ret = 1;
                }
                // Middle of element
                else if ( !element_position.left && !element_position.right && element_rect.left < 0 && element_rect.right >= container_rect.width ){
                    // We don't want an exact percent when its overflowing. Consider it 1.
                    if ( instance.settings.ignoreOverflow ){
                        ret = 1;
                    }
                    // We want the exact percent
                    else {
                        ret = container_rect.width / element_rect.width;
                    }
                }
                // The element isn't visible
                else {
                    ret = 0;
                }
                // Return the percent
                return ret;
            },
            /**
             * getPercentY
             * ---
             * @return {Number} [A number from 0 to 1 of the amount of the element visible]
             */
            _getPercentY: function(){
                var 
                    instance = this,
                    element = instance.element,
                    element_rect = instance._data.element.rect,
                    element_position = instance._data.element.position,
                    container_rect = instance._data.container.rect,
                    ret = 0;

                // If either the top or bottom is visible
                if ( element_position.top && !element_position.bottom || !element_position.top && element_position.bottom ){
                    // Top is visible, coming from bottom
                    if ( element_position.top ){
                        ret = (container_rect.height - element_rect.top) / element_rect.height;
                    }
                    // Bottom is visible, coming from top
                    else {
                        ret = element_rect.bottom / element_rect.height;
                    }
                }
                // If both are visible
                else if ( element_position.top && element_position.bottom ){
                    ret = 1;
                }
                // Middle of element
                else if ( !element_position.top && !element_position.bottom && element_rect.top < 0 && element_rect.bottom >= container_rect.height ){
                    // We don't want an exact percent when its overflowing. Consider it 1.
                    if ( instance.settings.ignoreOverflow ){
                        ret = 1;
                    }
                    // We want the exact percent
                    else {
                        ret = container_rect.height / element_rect.height;
                    }
                }
                // The element isn't visible
                else {
                    ret = 0;
                }
                // Return the percent
                return ret;
            },
            _normalizePercent: function( percent ){
                var ret = 0;

                if ( percent > 1 ){
                    ret = 1;
                }
                else if ( percent < 0 ){
                    ret = 0;
                }
                else {
                    ret = percent;
                }
                return ret;
            },
            /**
             * updateElementVisibility
             * ---
             * Run all set functions to save the information
             */
            _updateElementVisibility: function(){
                var instance = this;

                instance._setContainerData.call( instance );
                instance._setElementOffset.call( instance );
                instance._setElementData.call( instance );
                instance._setElementPosition.call( instance );
                instance._setElementVisibility.call( instance );
                instance._setElementPercent.call( instance );
                instance._setElementProgress.call( instance );
            },
            /**
             * bindEvents
             * ---
             * Bind the container to the proper events.
             * Remap that to our own namespaced events in the plugin.
             */
            _bindEvents: function(){
                var 
                    instance = this,
                    container = instance.settings.container,
                    $cont = jQuery(container);

                // Hook into native events
                // Use requestAnimationFrame to throttle them
                instance._throttle( 'resize', 'resize.'+pluginName, $cont[0] );
                instance._throttle( 'scroll', 'scroll.'+pluginName, $cont[0] );

                $cont.on('orientationchange', function(event){ $cont.trigger('resize.'+pluginName); });

                // Map to our plugin namespace
                $cont.on('scroll.'+pluginName, function viziScroll(event){ event.stopPropagation(); instance._event.call( instance, 'scroll'); });
                $cont.on('resize.'+pluginName, function viziResize(event){ event.stopPropagation(); instance._event.call( instance, 'resize'); });
            },
            /**
             * event
             * ---
             * Look at the current data and run checks to get new data.
             * Return the appropriate callback, if applicable, with the event data.
             * Each callback offers the element and event data for the arguments.
             * 
             * @param  {String} type [The type of event that is being called.]
             */
            _event: function( type ){
                var 
                    instance = this,
                    event_element = instance.element,
                    event_object = {
                        position: {},
                        visible: false
                    },
                    isVisible = false,
                    previously_visible = instance._data.element.visible; // Old visibility

                // Updated all percentages, positions, visibility data
                instance._updateElementVisibility.call( instance );
                // Write the new data to our event object, for use in callbacks
                event_object.position = instance._data.element.position;
                // Only return this if the user wants it
                if ( instance.settings.percentVisible ){
                    event_object.percent = { x: null, y: null };
                    event_object.percent.x = instance._data.element.percent.x;
                    event_object.percent.y = instance._data.element.percent.y;                
                }
                if ( instance.settings.percentProgress ){
                    event_object.progress = { x: null, y: null };
                    event_object.progress.x = instance._data.element.progress.x;
                    event_object.progress.y = instance._data.element.progress.y;  
                }
                // Update visibility data
                event_object.visible = instance._data.element.visible;
                isVisible = event_object.visible;
                // If the visibility changed
                if ( isVisible !== previously_visible ){
                    // Element is now visible
                    // And the setting is a function
                    if ( isVisible && jQuery.isFunction( instance.settings.onEnter ) ){
                        // Do onEnter
                        instance.settings.onEnter.call( event_element, event_object );
                    }
                    // Element is no longer visible
                    // And the setting is a function
                    else if ( !isVisible && jQuery.isFunction( instance.settings.onLeave ) ) {
                        // Do onLeave
                        instance.settings.onLeave.call( event_element, event_object );
                    }
                }
                // If the element is visible
                // And the setting is a function
                if ( isVisible && jQuery.isFunction( instance.settings.onVisible ) ){
                    // Do onVisible
                    instance.settings.onVisible.call( event_element, event_object );
                }

                if ( type === 'refresh' ){
                    return event_object;
                }

                frame = false;
            },

        /**
         * PUBLIC METHODS
         * ==============
         */
        
            /**
             * Refresh
             * ---
             * Update the data and run callbacks manually.
             */
            refresh: function(){
                var instance = this;

                return instance._event.call(instance, 'refresh');
            },
            /**
             * Visible
             * ---
             * Checks if the element is visible in the container.
             * @return {Boolean}
             */
            visible: function(){
                var 
                    instance = this,
                    elem_data = instance._data.element;

                return elem_data.visible;
            },
            /**
             * Percent
             * ---
             * Returns the percentage of the element visible in the container.
             * @param  {String} axis [What axis, x or y, we want the percentage for. Give both if no argument. Optional.]
             * @return {Number|Object}      [A number or object with percentage for one or both axis.]
             */
            percent: function( axis ){
                var 
                    instance = this,
                    elem_data = instance._data.element;

                switch( axis ){
                    case 'x':
                        return elem_data.percent.x;
                    case 'y':
                        return elem_data.percent.y;
                    default:
                        return {
                            x: elem_data.percent.x, 
                            y: elem_data.percent.y
                        };
                }
            },
            /**
             * Offset
             * ---
             * Allows the user to dynamically update an element's offset values.
             * Returns the current offset values if there are no arguments or if the arguments are invalid.
             * @param  {Object} args [An object of offset settings. ("{ top: 0, left: 10 }")]
             * @return {Object}      [The object of current offset settings for the element.]
             */
            offset: function( args ){
                var 
                    instance = this,
                    offset = instance._data.element.offset; // The current offset data
                // Args aren't defined or invalid
                if ( args === undefined || Object.getPrototypeOf({}) !== Object.getPrototypeOf(args) ){
                    return offset; // Return current offset data
                }
                // Just a number
                // Update all offsets to that
                else if ( !isNaN(args) ){
                    offset.left = offset.top = -args;
                    offset.right = offset.bottom = args;
                }
                // Good argument object
                // If there are new settings that are valid, apply them
                else if ( Object.getPrototypeOf({}) === Object.getPrototypeOf(args) ) {
                    if ( args.left !== undefined && !isNaN(args.left) ){ offset.left = -args.left; }
                    if ( args.top !== undefined && !isNaN(args.top) ){ offset.top = -args.top; }
                    if ( args.right !== undefined && !isNaN(args.right) ){ offset.right = args.right; }
                    if ( args.bottom !== undefined && !isNaN(args.bottom) ){ offset.bottom = args.bottom; }
                }
            }
    });

    // A really lightweight plugin wrapper around the constructor,
    // preventing against multiple instantiations
    $.fn[ pluginName ] = function ( options ) {
        var args = Array.prototype.slice.call( arguments, 1);
        var result = null;
        this.each(function() {
            // Cache the instance of the plugin on this element
            var instance = $.data( this, "plugin_" + pluginName );
            // Does the plugin already exist on this element?
            if ( !instance ) {
                $.data( this, "plugin_" + pluginName, new Plugin( this, options ) );
            }
            // If the plugin already exists on this element, check the string because someone is probably trying to get a public method going.
            else if ( typeof options === 'string' && options.charAt(0) !== '_' && $.isFunction(instance[options]) ){
                result = instance[options].apply(instance, args);
            }
        });
        // Isn't null if we run a public method that returns information.
        // Return the method result instead.
        if ( result !== null ){
        	return result;
        }
        // Return the jQuery object
        else {
	        return this;
	    }
    };
}));